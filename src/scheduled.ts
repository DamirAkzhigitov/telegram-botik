import { Context } from './types'
import { createBot } from './bot'

export async function handleScheduled(
  scheduledTime: number,
  env: Context
): Promise<void> {
  const now = scheduledTime || Date.now()
  const list = await env.CHAT_SESSIONS_STORAGE.list({ prefix: 'session_' })

  const bot = await createBot(env, false)
  const thirtyMinutes = 1 * 60 * 1000
  for (const entry of list.keys) {
    try {
      const key = entry.name
      const chatId = key.replace('session_', '')
      const sessionDataJSON = await env.CHAT_SESSIONS_STORAGE.get(key)
      if (!sessionDataJSON) continue
      const sessionData = JSON.parse(sessionDataJSON)

      const lastBotTime = sessionData.lastBotMessageTime
        ? Number(sessionData.lastBotMessageTime)
        : 0
      const lastUserTime = sessionData.lastUserMessageTime
        ? Number(sessionData.lastUserMessageTime)
        : 0
      const lastMessageFromBot = sessionData.lastMessageFromBot || false

      if (
        lastMessageFromBot ||
        (lastUserTime < lastBotTime && now - lastBotTime >= thirtyMinutes)
      ) {
        continue
      }

      const reflection = sessionData.reflection || ''
      const newMessageText =
        reflection.trim() !== ''
          ? reflection
          : 'Небольшое напоминание: я здесь, пишите если хотите общаться!'
      await bot.telegram.sendMessage(Number(chatId), newMessageText)

      sessionData.lastBotMessageTime = Date.now().toString()
      sessionData.lastMessageFromBot = true
      sessionData.reflection = ''

      await env.CHAT_SESSIONS_STORAGE.put(key, JSON.stringify(sessionData))
    } catch (e) {
      console.error('Error processing session', entry.name, e)
    }
  }
}
