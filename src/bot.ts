import { Telegraf } from 'telegraf'
import { createGptService } from './services/GptService'
import { message } from 'telegraf/filters'
import { delay, findByEmoji, getRandomValueArr } from './utils'
import { Sticker } from './types'
import { createSessionService } from './services/SessionService'
import { createTelegramService } from './services/TelegramService'
import {
  createMessageHandler,
  MessageContext
} from './services/MessageHandler'
import commands from './commands'

export async function createBot(env: Env, webhookReply = false) {
  const bot = new Telegraf(env.BOT_TOKEN, { telegram: { webhookReply } })

  // Setup services
  const gptService = createGptService(env.API_KEY)
  const sessionService = createSessionService(env)
  const telegramService = createTelegramService(bot, env.BOT_TOKEN)
  const messageHandler = createMessageHandler(
    sessionService,
    gptService,
    telegramService
  )

  // Register commands
  commands.forEach((command) => {
    command(bot, sessionService)
  })

  // Register message handler
  bot.on(message(), async (ctx) => {
    try {
      // Adapt telegraf context to our message context
      const messageContext: MessageContext = {
        chatId: ctx.chat.id,
        from: ctx.message.from,
        text: 'text' in ctx.message ? ctx.message.text : undefined,
        photo: 'photo' in ctx.message ? ctx.message.photo : undefined,
        sticker: 'sticker' in ctx.message ? ctx.message.sticker : undefined,
        caption: 'caption' in ctx.message ? ctx.message.caption : undefined,
        message_id: ctx.message.message_id
      }

      const actions = await messageHandler.handle(messageContext)

      // Execute actions
      for (const action of actions) {
        switch (action.type) {
          case 'sendMessage':
            await ctx.telegram.sendMessage(ctx.chat.id, action.text)
            break
          case 'sendSticker':
            await ctx.telegram.sendSticker(ctx.chat.id, action.fileId)
            break
          case 'setReaction':
            await ctx.telegram.setMessageReaction(
              ctx.chat.id,
              ctx.message.message_id,
              [{ type: 'emoji', emoji: action.emoji }]
            )
            break
          case 'sendChatAction':
            await ctx.telegram.sendChatAction(ctx.chat.id, action.action)
            break
        }
      }
      await delay()
    } catch (error) {
      console.error('Error processing message:', error)
    }
  })

  return bot
}
