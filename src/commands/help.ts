import { Context, Telegraf } from 'telegraf'

export function help(bot: Telegraf<Context<any>>) {
  bot.command('help', async (ctx) => {
    try {
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        [
          '/help — показать список доступных команд.',
          '/set_new_prompt — установить новый промпт для бота.',
          '/add_sticker_pack — добавить новый стикер-пак.',
          '/reset_sticker_pack — сбросить текущий стикер-пак.',
          // '/set_reply_chance — установить вероятность, с которой бот будет отвечать на сообщения.',
          '/show_memories — показать сохранённую информацию о чате.',
          '/clear_memories — удалить все сохранённые данные о чате.',
          '/clear_messages — очистить историю сообщений.',
          '/get_prompt — вывести текущий установленный промпт.'
        ].join('\n')
      )
    } catch (error) {
      console.error('Error help:', error)
    }
  })
}
