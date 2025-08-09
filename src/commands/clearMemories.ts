import { Context, Telegraf } from 'telegraf'
import { SessionService } from '../types'

export function clearMemories(
  bot: Telegraf<Context>,
  sessionService: SessionService
) {
  bot.command('clear_memories', async (ctx) => {
    try {
      const chatId = ctx.chat.id

      await sessionService.updateSession(chatId, {
        memories: []
      })

      await ctx.telegram.sendMessage(
        chatId,
        'Все сохраненные воспоминания были удалены.'
      )
    } catch (error) {
      console.error('Error clearing memories:', error)
    }
  })
}
