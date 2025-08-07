import { Context, Telegraf } from 'telegraf'

export function resetSticker(
  bot: Telegraf<Context<any>>,
  sessionController: any,
  userService?: any
) {
  bot.command('reset_sticker_pack', async (ctx) => {
    try {
      await sessionController.getSession(ctx.chat.id)
      await sessionController.resetStickers(ctx.chat.id)

      await ctx.telegram.sendMessage(
        ctx.chat.id,
        'Стикер пак обновлен до стандартного'
      )
    } catch (error) {
      console.error('Error reset_sticker_pack:', error)
    }
  })
}
