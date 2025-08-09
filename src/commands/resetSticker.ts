import { Context, Telegraf } from 'telegraf'
import { SessionService } from '../types'

export function resetSticker(
  bot: Telegraf<Context>,
  sessionService: SessionService
) {
  bot.command('reset_sticker_pack', async (ctx) => {
    try {
      await sessionService.resetStickers(ctx.chat.id)

      await ctx.telegram.sendMessage(
        ctx.chat.id,
        'Стикер пак обновлен до стандартного'
      )
    } catch (error) {
      console.error('Error reset_sticker_pack:', error)
    }
  })
}
