import { createBot } from './bot/createBot'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleUpdate(request, env)
  }
}

async function handleUpdate(request: Request, env: Env) {
  if (request.method === 'POST') {
    try {
      const bot = await createBot(env)
      const update = await request.json()
      await bot.handleUpdate(update as any)

      return new Response('OK')
    } catch (error) {
      return new Response('Invalid request', { status: 400 })
    }
  }
  return new Response('Method Not Allowed', { status: 405 })
}
