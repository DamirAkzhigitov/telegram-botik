import { authenticateRequest } from './auth'
import OpenAI from 'openai'

const PROMPT = `We are creating a new sticker pack for Telegram. One image contains an actor (person/character) and the second image contains a sticker. Generate a new image that shows the actor repeating or mimicking the sticker - the actor should be posed and styled to match the sticker's expression, pose, or action. The output should look like a cohesive sticker suitable for a Telegram sticker pack.`

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

  if (!env.API_KEY) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
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

  const openai = new OpenAI({ apiKey: env.API_KEY })

  try {
    const response = await openai.images.edit({
      model: 'gpt-image-1.5',
      image: [actorImage, stickerFile],
      prompt: PROMPT,
      output_format: 'png'
    })

    const imageData = response.data?.[0]
    if (!imageData?.b64_json) {
      return new Response(
        JSON.stringify({ error: 'Image generation failed' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const imageBytes = Buffer.from(imageData.b64_json, 'base64')
    return new Response(imageBytes, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (err) {
    console.error('OpenAI image generation error:', err)
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
