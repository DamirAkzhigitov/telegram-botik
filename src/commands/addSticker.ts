import { Context, Telegraf } from 'telegraf'

export function addSticker (
  bot: Telegraf<Context<any>>,
  sessionController: any
) {
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
