import { Context, Telegraf } from 'telegraf'
import { SessionService } from '../types'

export function getPrompt(bot: Telegraf<Context>, sessionService: SessionService) {
  bot.command('get_prompt', async (ctx) => {
    try {
      const sessionData = await sessionService.getSession(ctx.chat.id)

      await ctx.telegram.sendMessage(
        ctx.chat.id,
        `Текущий промпт: ${sessionData.prompt}`
      )
    } catch (error) {
      console.error('Error get_prompt:', error)
    }
  })
}