import { Context, Telegraf } from 'telegraf'
import type { SessionController } from '../service/SessionController'
import type { UserService } from '../service/UserService'
import { ALLOWED_TEXT_MODELS, DEFAULT_TEXT_MODEL } from '../constants/models'

export function setModel(
  bot: Telegraf<Context>,
  sessionController: SessionController,
  _userService?: UserService
) {
  bot.command('set_model', async (ctx) => {
    try {
      const session = await sessionController.getSession(ctx.chat.id)
      await sessionController.updateSession(ctx.chat.id, {
        model: 'not_set'
      })
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        `Отправьте в следующем сообщении одну из моделей: ${ALLOWED_TEXT_MODELS.join(', ')}.\nЕсли выбрать не получится, установим ${DEFAULT_TEXT_MODEL}.`,
        session.chat_settings.send_message_option
      )
    } catch (error) {
      console.error('Error updating prompt:', error)
    }
  })
}
