import { Context, Telegraf } from 'telegraf'
import type { SessionController } from '../service/SessionController'

export function clearMessage(
  bot: Telegraf<Context<any>>,
  sessionController: SessionController,
  userService?: any
) {
  bot.command('clear_messages', async (ctx) => {
    try {
      const sessionData = await sessionController.getSession(ctx.chat.id)
      await sessionController.updateSession(ctx.chat.id, {
        userMessages: []
      })
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        'История сообщений очищена',
        sessionData.chat_settings.send_message_option
      )
    } catch (error) {
      console.error('Error clear_messages:', error)
    }
  })
}
