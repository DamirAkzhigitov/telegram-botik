import { Context, Telegraf } from 'telegraf'
import type { SessionController } from '../service/SessionController'

export function addSticker(
  bot: Telegraf<Context<any>>,
  sessionController: SessionController,
  userService?: any
) {
  bot.command('add_sticker_pack', async (ctx) => {
    try {
      const sessionData = await sessionController.getSession(ctx.chat.id)
      await sessionController.updateSession(ctx.chat.id, {
        stickerNotSet: true
      })
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        'В следующем сообщении отправьте стикер который я должен использовать',
        sessionData.chat_settings.send_message_option
      )
    } catch (error) {
      console.error('Error add_sticker_pack:', error)
    }
  })
}
