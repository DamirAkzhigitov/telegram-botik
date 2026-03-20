import { Telegraf } from 'telegraf'
import type { UserFromGetMe } from 'telegraf/types'
import { message } from 'telegraf/filters'
import commands from '../commands'
import { SessionController } from '../service/SessionController'
import { UserService } from '../service/UserService'
import { EmbeddingService } from '../service/EmbeddingService'
import { getOpenAIClient } from '../gpt'
import { createTelegramFileClient } from './media'
import { handleIncomingMessage } from './messageHandler'

function parseBotInfoFixture(
  json: string | undefined
): UserFromGetMe | undefined {
  if (!json?.trim()) return undefined
  try {
    return JSON.parse(json) as UserFromGetMe
  } catch {
    return undefined
  }
}

export const createBot = (env: Env, webhookReply = false) => {
  const { responseApi, openai } = getOpenAIClient(env.API_KEY)

  const embeddingService = new EmbeddingService(env)
  const bot = new Telegraf(env.BOT_TOKEN, {
    telegram: {
      webhookReply,
      ...(env.TELEGRAM_API_ROOT ? { apiRoot: env.TELEGRAM_API_ROOT } : {})
    }
  })
  const fixtureBot = parseBotInfoFixture(env.TELEGRAM_BOT_INFO_JSON)
  if (fixtureBot) {
    bot.botInfo = fixtureBot
  }
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
