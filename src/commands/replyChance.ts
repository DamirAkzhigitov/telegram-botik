import { Markup, Context, Telegraf } from 'telegraf'
import { messages, replyChances } from '../config'
import { SessionService } from '../types'

export function replyChance(
  bot: Telegraf<Context>,
  sessionService: SessionService
) {
  bot.command('set_reply_chance', async (ctx) => {
    await ctx.reply(
      'Вероятность ответа:',
      Markup.inlineKeyboard(
        replyChances.map((chance) =>
          Markup.button.callback(`${Number(chance) * 100}%`, chance)
        )
      )
    )
  })

  bot.action(replyChances, async (ctx) => {
    await ctx.answerCbQuery()

    const percentage = ctx.match[0]

    if (ctx.chat?.id) {
      await sessionService.updateSession(ctx.chat.id, {
        replyChance: percentage
      })
    }

    await ctx.editMessageText(messages.replyChanceSet(percentage))
  })
}
