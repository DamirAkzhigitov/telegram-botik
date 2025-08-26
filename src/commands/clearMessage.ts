import { Context, Telegraf } from 'telegraf'

export function clearMessage (
  bot: Telegraf<Context<any>>,
  sessionController: any,
  userService?: any
) {
  bot.command('clear_messages', async (ctx) => {
    try {
      await sessionController.getSession(ctx.chat.id)
      await sessionController.updateSession(ctx.chat.id, {
        userMessages: []
      })
      await ctx.telegram.sendMessage(ctx.chat.id, 'История сообщений очищена')
    } catch (error) {
      console.error('Error clear_messages:', error)
    }
  })
}
