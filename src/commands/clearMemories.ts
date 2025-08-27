import { Context, Telegraf } from 'telegraf'
import type { SessionController } from '../service/SessionController'

export function clearMemories(
  bot: Telegraf<Context<any>>,
  sessionController: SessionController,
  userService?: any
) {
  bot.command('clear_memories', async (ctx) => {
    try {
      const chatId = ctx.chat.id

      const sessionData = await sessionController.getSession(ctx.chat.id)
      await sessionController.updateSession(chatId, {
        memories: []
      })

      await ctx.telegram.sendMessage(
        chatId,
        'Все сохраненные воспоминания были удалены.',
        sessionData.chat_settings.send_message_option
      )
    } catch (error) {
      console.error('Error clearing memories:', error)
    }
  })
}
