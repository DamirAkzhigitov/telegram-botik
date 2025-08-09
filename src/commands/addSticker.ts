import { Context, Telegraf } from 'telegraf'
import { SessionService } from '../types'

export function addSticker(bot: Telegraf<Context>, sessionService: SessionService) {
  bot.command('add_sticker_pack', async (ctx) => {
    try {
      await sessionService.updateSession(ctx.chat.id, {
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
