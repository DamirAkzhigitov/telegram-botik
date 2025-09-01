import { Context, Telegraf } from 'telegraf'
import type { SessionController } from '../service/SessionController'

export function setModel(
  bot: Telegraf<Context<any>>,
  sessionController: SessionController,
  userService?: any
) {
  bot.command('set_model', async (ctx) => {
    try {
      const session = await sessionController.getSession(ctx.chat.id)
      await sessionController.updateSession(ctx.chat.id, {
        model: 'not_set'
      })
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        'В следующем сообщении отправьте системный промпт',
        session.chat_settings.send_message_option
      )
    } catch (error) {
      console.error('Error updating prompt:', error)
    }
  })
}
