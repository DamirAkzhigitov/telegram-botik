import { Context, Telegraf } from 'telegraf'

export function clearMemories(
  bot: Telegraf<Context<any>>,
  sessionController: any
) {
  bot.command('clear_memories', async (ctx) => {
    try {
      const chatId = ctx.chat.id

      await sessionController.getSession(ctx.chat.id)
      await sessionController.updateSession(chatId, {
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
