import { Context, Telegraf } from 'telegraf'
import type { SessionController } from '../service/SessionController'

export function showMemories(
  bot: Telegraf<Context<any>>,
  sessionController: SessionController,
  userService?: any
) {
  bot.command('show_memories', async (ctx) => {
    try {
      const chatId = ctx.chat.id
      const sessionData = await sessionController.getSession(chatId)

      if (!sessionData.memories || sessionData.memories.length === 0) {
        await ctx.telegram.sendMessage(
          chatId,
          'У меня пока нет сохраненных воспоминаний об этом чате.',
          sessionData.chat_settings.send_message_option
        )
        return
      }

      const memories = sessionData.memories
        .map((memory, index) => `${index + 1}. ${memory.content}`)
        .join('')

      await ctx.telegram.sendMessage(
        chatId,
        `Вот что я запомнил:${memories}`,
        sessionData.chat_settings.send_message_option
      )
    } catch (error) {
      console.error('Error showing memories:', error)
    }
  })
}
