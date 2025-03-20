import { Markup, Context, Telegraf} from 'telegraf'

export function replyChance(bot: Telegraf<Context<any>>, sessionController: any) {
  const chances = ['0.05', '0.25', '0.50', '0.75', '1']

  bot.command('set_reply_chance', async (ctx) => {
    await ctx.reply('Вероятность ответа:', Markup.inlineKeyboard(
      chances.map((chance) =>
        Markup.button.callback(`${Number(chance) * 100}%`, chance)
      )
    ))
  })

  bot.action(chances, async (ctx) => {
    await ctx.answerCbQuery()

    const percentage = ctx.match[0]

    if (ctx.chat?.id) {
      await sessionController.getSession(ctx.chat.id)
      await sessionController.updateSession(ctx.chat.id, {
        replyChance: percentage
      })
    }

    await ctx.editMessageText(`Вы выбрали ${Number(percentage) * 100}%`)
  })
}
