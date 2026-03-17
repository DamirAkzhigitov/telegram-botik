import { authenticateRequest } from './auth'

/**
 * POST /api/send-sticker-to-user - Send generated sticker to user's Telegram chat
 * Body: FormData with image (File)
 * Auth: _auth query param or dev=1 for localhost
 *
 * Sends the image via Bot API sendDocument so the user can download it from their chat.
 */
export async function sendStickerToUser(
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

  let imageFile: File

  try {
    const formData = await request.formData()
    imageFile = formData.get('image') as File

    if (!imageFile || !(imageFile instanceof File)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid image' }),
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

  const chatId = auth.userId
  if (!chatId) {
    return new Response(
      JSON.stringify({
        error: 'Open this app from Telegram to send the sticker to your chat.'
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }

  const apiUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`

  const form = new FormData()
  form.append('chat_id', String(chatId))
  form.append('document', imageFile, 'sticker.png')

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      body: form
    })

    const data: { ok: boolean; error?: string } = await res.json()

    if (!data.ok) {
      return new Response(
        JSON.stringify({ error: data.error || 'Failed to send' }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    return new Response(
      JSON.stringify({ ok: true, message: 'Sent to your Telegram chat' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (err) {
    console.error('sendStickerToUser error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to send to Telegram' }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}
