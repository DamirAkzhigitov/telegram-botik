import { Context, Telegraf } from 'telegraf'
import type { SessionController } from '../service/SessionController'
import type { UserService } from '../service/UserService'

export function setNewPrompt(
  bot: Telegraf<Context>,
  sessionController: SessionController,
  _userService?: UserService
) {
  bot.command('set_new_prompt', async (ctx) => {
    try {
      const session = await sessionController.getSession(ctx.chat.id)
      await sessionController.updateSession(ctx.chat.id, {
        promptNotSet: true
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
