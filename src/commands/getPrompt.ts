import { Context, Telegraf } from 'telegraf'
import type { SessionController } from '../service/SessionController'
import type { UserService } from '../service/UserService'

export function getPrompt(
  bot: Telegraf<Context>,
  sessionController: SessionController,
  _userService?: UserService
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
