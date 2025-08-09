import { Context, Telegraf } from 'telegraf'
import { SessionService } from '../types'

export function clearMessage(
  bot: Telegraf<Context>,
  sessionService: SessionService
) {
  bot.command('clear_messages', async (ctx) => {
    try {
      await sessionService.updateSession(ctx.chat.id, {
        userMessages: []
      })
      await ctx.telegram.sendMessage(ctx.chat.id, 'История сообщений очищена')
    } catch (error) {
      console.error('Error clear_messages:', error)
    }
  })
}