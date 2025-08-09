import { Context, Telegraf } from 'telegraf'
import { SessionService } from '../types'

export function showMemories(
  bot: Telegraf<Context>,
  sessionService: SessionService
) {
  bot.command('show_memories', async (ctx) => {
    try {
      const chatId = ctx.chat.id
      const sessionData = await sessionService.getSession(chatId)

      if (!sessionData.memories || sessionData.memories.length === 0) {
        await ctx.telegram.sendMessage(
          chatId,
          'У меня пока нет сохраненных воспоминаний об этом чате.'
        )
        return
      }

      const memories = sessionData.memories
        .map((memory, index) => `${index + 1}. ${memory.content}`)
        .join('\n')

      await ctx.telegram.sendMessage(chatId, `Вот что я запомнил:\n${memories}`)
    } catch (error) {
      console.error('Error showing memories:', error)
    }
  })
}
