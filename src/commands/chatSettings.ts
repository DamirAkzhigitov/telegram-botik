import { Context, Telegraf } from 'telegraf'
import type { SessionController } from '../service/SessionController'

export function configureChatSettings(
  bot: Telegraf<Context<any>>,
  sessionController: SessionController,
  userService?: any
) {
  bot.command('set_tread_id', async (ctx) => {
    try {
      const commandText = ctx.message.text
      const prompt = commandText.replace(/^\/set_tread_id\s*/, '').trim()

      console.log({
        log: 'set_tread_id',
        prompt
      })

      const topicId = parseInt(prompt)
      if (!prompt || !topicId) {
        return await ctx.reply(
          `❌ Пожалуйста, укажите id топика !\n\n` + { parse_mode: 'Markdown' }
        )
      }
      await sessionController.getSession(ctx.chat.id)
      await sessionController.updateSession(ctx.chat.id, {
        chat_settings: {
          thread_id: topicId,
          reply_only_in_thread: true,
          send_message_option: {
            message_thread_id: topicId
          }
        }
      })
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        `Настройки обновлены, установлет id топика: ${topicId}`
      )
    } catch (error) {
      console.error('Error add_sticker_pack:', error)
    }
  })
}
