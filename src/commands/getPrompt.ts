import { Context, Telegraf } from 'telegraf'
import type { SessionController } from '../service/SessionController'

export function getPrompt(
  bot: Telegraf<Context<any>>,
  sessionController: SessionController,
  userService?: any
) {
  bot.command('get_prompt', async (ctx) => {
    try {
      const sessionData = await sessionController.getSession(ctx.chat.id)

      await ctx.telegram.sendMessage(
        ctx.chat.id,
        `Текущий промпт: ${sessionData.prompt}`
      )
    } catch (error) {
      console.error('Error get_prompt:', error)
    }
  })
}
