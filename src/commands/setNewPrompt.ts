import { Context, Telegraf } from 'telegraf'
import { SessionService } from '../types'

export function setNewPrompt(
  bot: Telegraf<Context>,
  sessionService: SessionService
) {
  bot.command('set_new_prompt', async (ctx) => {
    try {
      await sessionService.updateSession(ctx.chat.id, {
        promptNotSet: true
      })
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        'В следующем сообщении отправьте системный промпт'
      )
    } catch (error) {
      console.error('Error updating prompt:', error)
    }
  })
}