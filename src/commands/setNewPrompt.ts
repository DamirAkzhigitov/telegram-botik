import { Context, Telegraf } from 'telegraf'

export function setNewPrompt (
  bot: Telegraf<Context<any>>,
  sessionController: any
) {
  bot.command('set_new_prompt', async (ctx) => {
    try {
      await sessionController.getSession(ctx.chat.id)
      await sessionController.updateSession(ctx.chat.id, {
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