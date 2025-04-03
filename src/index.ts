import { createBot } from './bot'
import { handleScheduled } from './scheduled'
import { GoogleSearchService } from './service/GoogleSearch'
import { getOpenAIClient } from './gpt'
import OpenAI from 'openai'
import { BotReply, Sticker } from './types'
import { delay, findByEmoji, getRandomValueArr } from './utils'
import { TelegramEmoji } from 'telegraf/types'
import { SessionController } from './service/SessionController'

async function handleUpdate(request: Request, env: Env) {
  if (request.method === 'POST') {
    try {
      const bot = await createBot(env)
      const update = await request.json()
      await bot.handleUpdate(update as any)
      return new Response('OK')
    } catch (error) {
      return new Response('Invalid request', { status: 400 })
    }
  }
  return new Response('Method Not Allowed', { status: 405 })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleUpdate(request, env)
  },
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    await handleScheduled(event.scheduledTime, env)
  },
  async queue(
    batch: MessageBatch<{
      type: string
      content: string
      chat_id: string
      message_id: string
      user_message: string
    }>,
    env: Env
  ): Promise<void> {
    const bot = await createBot(env)
    const { openAi } = getOpenAIClient(env.API_KEY)
    const googleSearchService = new GoogleSearchService(
      env.SEARCH_KEY,
      env.SEARCH_CX
    )
    const sessionController = new SessionController(env)

    for (const message of batch.messages) {
      try {
        console.log('queue message: ', message.body)
        const {
          type,
          content,
          chat_id,
          user_message: userMessage
        } = message.body

        const sessionData = await sessionController.getSession(chat_id)

        if (type === 'search') {
          const result = await googleSearchService.search(content)

          console.log('queue search result: ', result)

          const assistantResponse: OpenAI.Chat.ChatCompletionMessage = {
            role: 'assistant',
            content: `ты уже выполнил поиск и получил результаты, тебе нужно построить ответ на основе результатов: ${JSON.stringify(result)}`,
            refusal: null
          }

          const botReply = await openAi([
            JSON.parse(userMessage),
            assistantResponse
          ])

          if (!botReply?.content) return

          const botMessages = JSON.parse(botReply.content)?.items as BotReply[]

          const asyncActions = botMessages.map(
            async ({ content, type, chat_id, message_id }) => {
              if (type === 'search') {
                return env.QUEUE.send({
                  type,
                  content,
                  chat_id,
                  message_id,
                  user_message: JSON.stringify(userMessage)
                })
              }
              if (type === 'emoji') {
                const stickerSet = getRandomValueArr(sessionData.stickersPacks)
                const response = await bot.telegram.getStickerSet(stickerSet)
                const stickerByEmoji = findByEmoji(
                  response.stickers as Sticker[],
                  content
                )
                return bot.telegram.sendSticker(chat_id, stickerByEmoji.file_id)
              } else if (type === 'message') {
                return bot.telegram.sendMessage(chat_id, content, {
                  ...(message_id
                    ? {
                        reply_parameters: {
                          message_id
                        }
                      }
                    : {})
                })
              } else if (type === 'reaction') {
                return bot.telegram.setMessageReaction(chat_id, message_id, [
                  {
                    type: 'emoji',
                    emoji: content as TelegramEmoji
                  }
                ])
              } else if (type === 'reflection') {
              }
            }
          )

          await Promise.allSettled([
            bot.telegram.sendChatAction(chat_id, 'typing'),
            delay,
            ...asyncActions
          ])

          await sessionController.updateSession(chat_id, {
            userMessages: [...sessionData.userMessages.slice(0, 20), botReply],
            lastUserMessageTime: Date.now().toString(),
            lastMessageFromBot: true
          })
        }

        message.ack() // Acknowledge successful processing
      } catch (error) {
        console.error(`Error processing message ${message.id}:`, error)
        message.retry() // Retry the message
      }
    }
  }
}
