import { Context, Telegraf } from 'telegraf'
import type { SessionController } from '../service/SessionController'
import type { UserService } from '../service/UserService'

export function resetSticker(
  bot: Telegraf<Context>,
  sessionController: SessionController,
  _userService?: UserService
) {
  bot.command('reset_sticker_pack', async (ctx) => {
    try {
      const sessionData = await sessionController.getSession(ctx.chat.id)
      await sessionController.resetStickers(ctx.chat.id)

      await ctx.telegram.sendMessage(
        ctx.chat.id,
        'Стикер пак обновлен до стандартного',
        sessionData.chat_settings.send_message_option
      )
    } catch (error) {
      console.error('Error reset_sticker_pack:', error)
    }
  })
}
