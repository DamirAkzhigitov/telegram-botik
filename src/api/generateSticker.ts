import { authenticateRequest } from './auth'

const PROMPT = `Мы делаем коллецию стикеров для телеграмма. передается фото и стикер. нам нужно объединить и передать идею стикера на первом фото и в результате должна быть только фотография, сам стикер не должен быть повторен на фото, а человек  на фото должен изобразить стикер в живую`

async function fileToDataUrl(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const mime = file.type || 'image/png'
  return `data:${mime};base64,${base64}`
}

interface GetFileResponse {
  ok: boolean
  result?: { file_path: string }
}

/**
 * POST /api/generate-sticker - Generate sticker from actor image + reference sticker
 * Body: FormData with actorImage (File) and either stickerFileId (string) or stickerImage (File)
 * Auth: _auth query param or dev=1 for localhost
 */
export async function generateSticker(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const auth = await authenticateRequest(request, env)
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const xaiApiKey = env.XAI_API_KEY ?? env.API_KEY
  if (!xaiApiKey) {
    return new Response(
      JSON.stringify({
        error: 'xAI API key not configured (XAI_API_KEY or API_KEY)'
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }

  let actorImage: File
  let stickerFile: File

  try {
    const formData = await request.formData()
    actorImage = formData.get('actorImage') as File
    const stickerFileId = (formData.get('stickerFileId') as string)?.trim()
    const stickerImage = formData.get('stickerImage') as File

    if (!actorImage || !(actorImage instanceof File)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid actorImage' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    if (stickerImage && stickerImage instanceof File) {
      // User uploaded reference image directly
      const ext = stickerImage.name.split('.').pop()?.toLowerCase() ?? ''
      if (
        ext !== 'webp' &&
        ext !== 'png' &&
        ext !== 'jpg' &&
        ext !== 'jpeg' &&
        ext !== 'gif'
      ) {
        return new Response(
          JSON.stringify({
            error: 'Reference image must be WebP, PNG, JPG, or GIF.'
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }
      stickerFile = stickerImage
    } else if (stickerFileId) {
      // Fetch sticker from Telegram
      const apiUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/getFile?file_id=${encodeURIComponent(stickerFileId)}`
      const fileRes = await fetch(apiUrl)
      const fileData: GetFileResponse = await fileRes.json()

      if (!fileData.ok || !fileData.result?.file_path) {
        return new Response(
          JSON.stringify({ error: 'Sticker file not found' }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }

      const stickerUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${fileData.result.file_path}`
      const stickerRes = await fetch(stickerUrl)

      if (!stickerRes.ok) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch sticker' }),
          {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }

      const ext =
        fileData.result.file_path.split('.').pop()?.toLowerCase() ?? ''
      if (ext !== 'webp' && ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg') {
        return new Response(
          JSON.stringify({
            error:
              'Only static image stickers (WebP, PNG, JPG) are supported. Animated stickers (TGS) cannot be used.'
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }

      const stickerBuffer = await stickerRes.arrayBuffer()
      const stickerBlob = new Blob([stickerBuffer], {
        type: stickerRes.headers.get('Content-Type') || 'image/webp'
      })
      stickerFile = new File([stickerBlob], 'sticker.webp', {
        type: stickerBlob.type
      })
    } else {
      return new Response(
        JSON.stringify({
          error:
            'Provide either stickerFileId or stickerImage (upload reference image)'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid form data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const [actorDataUrl, stickerDataUrl] = await Promise.all([
      fileToDataUrl(actorImage),
      fileToDataUrl(stickerFile)
    ])

    const editRes = await fetch('https://api.x.ai/v1/images/edits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${xaiApiKey}`
      },
      body: JSON.stringify({
        model: 'grok-imagine-image',
        prompt: PROMPT,
        images: [
          { url: actorDataUrl, type: 'image_url' },
          { url: stickerDataUrl, type: 'image_url' }
        ]
      })
    })

    if (!editRes.ok) {
      const errBody = await editRes.text()
      console.error('xAI edits API error:', editRes.status, errBody)
      throw new Error(errBody || `xAI API returned ${editRes.status}`)
    }

    const editData = await editRes.json()
    const imageUrl = editData.data?.[0]?.url
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Image generation failed' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const imageRes = await fetch(imageUrl)
    if (!imageRes.ok) {
      throw new Error(`Failed to fetch generated image: ${imageRes.status}`)
    }
    const imageBytes = Buffer.from(await imageRes.arrayBuffer())
    const contentType = imageRes.headers.get('Content-Type') || 'image/png'
    return new Response(imageBytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (err) {
    console.error('Grok image generation error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: `Image generation failed: ${message}` }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}
