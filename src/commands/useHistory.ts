import { Context, Telegraf } from 'telegraf'
import type { SessionController } from '../service/SessionController'
import type { UserService } from '../service/UserService'

export function useHistory(
  bot: Telegraf<Context>,
  sessionController: SessionController,
  _userService?: UserService
) {
  bot.command('toggle_history', async (ctx) => {
    try {
      const session = await sessionController.getSession(ctx.chat.id)
      const val = 'toggle_history' in session ? !session.toggle_history : true
      await sessionController.updateSession(ctx.chat.id, {
        toggle_history: val
      })
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        `Параметр toggle_history установлен: ${val}`,
        session.chat_settings.send_message_option
      )
    } catch (error) {
      console.error('Error updating prompt:', error)
    }
  })
}
