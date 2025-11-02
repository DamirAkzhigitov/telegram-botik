import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import commands from '../commands'
import { SessionController } from '../service/SessionController'
import { UserService } from '../service/UserService'
import { EmbeddingService } from '../service/EmbeddingService'
import { getOpenAIClient } from '../gpt'
import { createTelegramFileClient } from './media'
import { handleIncomingMessage } from './messageHandler'

export const createBot = (env: Env, webhookReply = false) => {
  const { responseApi, openai } = getOpenAIClient(env.API_KEY)

  const embeddingService = new EmbeddingService(env)
  const bot = new Telegraf(env.BOT_TOKEN, { telegram: { webhookReply } })
  const sessionController = new SessionController(env)
  const userService = new UserService(env.DB)
  const telegramFileClient = createTelegramFileClient()

  commands.forEach((command) => {
    command(bot, sessionController, userService, env)
  })

  bot.on(message(), async (ctx) => {
    try {
      await handleIncomingMessage(ctx, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai
      })
    } catch (error) {
      console.error('Error processing message:', error)
    }
  })

  return bot
}
