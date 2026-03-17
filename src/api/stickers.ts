import { authenticateRequest } from './auth'

const DEFAULT_STICKER_PACKS = ['koshachiy_raskolbas', 'gufenpchela']

interface TelegramSticker {
  file_id: string
  emoji?: string
  set_name: string
}

interface GetStickerSetResponse {
  ok: boolean
  result?: {
    stickers: TelegramSticker[]
  }
}

interface GetFileResponse {
  ok: boolean
  result?: {
    file_path: string
  }
}

/**
 * GET /api/sticker-packs - List available sticker pack names
 */
export async function getStickerPacks(
  request: Request,
  env: Env
): Promise<Response> {
  const auth = await authenticateRequest(request, env)
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(
    JSON.stringify({ packs: DEFAULT_STICKER_PACKS }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    }
  )
}

/**
 * GET /api/stickers?pack=name - Get stickers from a pack
 */
export async function getStickers(
  request: Request,
  env: Env
): Promise<Response> {
  const auth = await authenticateRequest(request, env)
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const url = new URL(request.url)
  const pack = url.searchParams.get('pack')
  if (!pack) {
    return new Response(
      JSON.stringify({ error: 'Missing pack parameter' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }

  const apiUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/getStickerSet?name=${encodeURIComponent(pack)}`
  const res = await fetch(apiUrl)
  const data = (await res.json()) as GetStickerSetResponse

  if (!data.ok || !data.result?.stickers) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch sticker set' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }

  const stickers = data.result.stickers.map((s) => ({
    file_id: s.file_id,
    emoji: s.emoji,
    set_name: s.set_name
  }))

  return new Response(JSON.stringify({ stickers }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

/**
 * GET /api/sticker-file?file_id=xxx - Proxy sticker image from Telegram (no token exposure)
 */
export async function getStickerFile(
  request: Request,
  env: Env
): Promise<Response> {
  const auth = await authenticateRequest(request, env)
  if (!auth) {
    return new Response('Unauthorized', { status: 401 })
  }

  const url = new URL(request.url)
  const fileId = url.searchParams.get('file_id')
  if (!fileId) {
    return new Response('Missing file_id', { status: 400 })
  }

  const apiUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
  const res = await fetch(apiUrl)
  const data = (await res.json()) as GetFileResponse

  if (!data.ok || !data.result?.file_path) {
    return new Response('File not found', { status: 404 })
  }

  const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${data.result.file_path}`
  const fileRes = await fetch(fileUrl)

  if (!fileRes.ok) {
    return new Response('Failed to fetch file', { status: 502 })
  }

  return new Response(fileRes.body, {
    status: 200,
    headers: {
      'Content-Type': fileRes.headers.get('Content-Type') || 'image/webp',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}
