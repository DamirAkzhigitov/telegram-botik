import { Telegraf } from 'telegraf'
import { SessionController } from '../service/SessionController'

export const setupAddStickerPackCommand = (
  bot: Telegraf,
  sessionController: SessionController
) => {
  bot.command('add_sticker_pack', async (ctx) => {
    try {
      await sessionController.getSession(ctx.chat.id)
      await sessionController.updateSession(ctx.chat.id, {
        stickerNotSet: true
      })
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        'В следующем сообщении отправьте стикер который я должен использовать'
      )
    } catch (error) {
      console.error('Error add_sticker_pack:', error)
    }
  })
}
