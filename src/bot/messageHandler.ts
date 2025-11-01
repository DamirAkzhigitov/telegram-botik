import type { Context } from 'telegraf'
import OpenAI from 'openai'
import type { AxiosInstance } from 'axios'
import { EmbeddingService } from '../service/EmbeddingService'
import { SessionController } from '../service/SessionController'
import { UserService } from '../service/UserService'
import type { MessagesArray } from '../types'
import {
  composeUserContent,
  createLoggedMessage,
  createUserMessage,
  extractMemoryItems,
  filterResponseMessages
} from './messageBuilder'
import {
  sanitizeHistoryMessages,
  buildAssistantHistoryMessages
} from './history'
import { collectImageInputs } from './media'
import { ensureSessionReady } from './sessionGuards'
import { dispatchResponsesSequentially } from './responseDispatcher'
import { delay } from '../utils'
import { BOT_NAME } from './constants'
import type { RecordMetadata } from '@pinecone-database/pinecone'

type ResponseApi = (
  messages: (
    | OpenAI.Responses.ResponseInputItem.Message
    | OpenAI.Responses.ResponseOutputMessage
  )[],
  options?: {
    hasEnoughCoins: boolean
    model: string | undefined
    prompt: string | undefined
  }
) => Promise<MessagesArray | null>

interface MessageHandlerDeps {
  env: Env
  responseApi: ResponseApi
  embeddingService: EmbeddingService
  sessionController: SessionController
  userService: UserService
  telegramFileClient: AxiosInstance
}

export const handleIncomingMessage = async (
  ctx: Context,
  deps: MessageHandlerDeps
) => {
  console.log('ctx: ', JSON.stringify(ctx, null, 2))
  if (ctx.message?.from?.is_bot) return

  if (!ctx.message?.from) return

  try {
    await deps.userService.registerOrGetUser({
      id: ctx.message.from.id,
      username: ctx.message.from.username,
      first_name: ctx.message.from.first_name,
      last_name: ctx.message.from.last_name
    })
  } catch (error) {
    console.error('Error registering user:', error)
  }

  const chatId = ctx.chat?.id
  if (!chatId) return

  const sessionData = await deps.sessionController.getSession(chatId)

  const shouldReply = sessionData.chat_settings.reply_only_in_thread
    ? ctx.message?.message_thread_id === sessionData.chat_settings.thread_id
    : true

  const username =
    ctx.message?.from?.username ||
    ctx.message?.from?.first_name ||
    ctx.message?.from?.last_name ||
    'Anonymous'
  const rawMessage =
    (ctx.message &&
    'text' in ctx.message &&
    typeof ctx.message.text === 'string'
      ? ctx.message.text
      : '') || ''
  const userMessage = rawMessage.replace(BOT_NAME, '')

  console.log({
    log: 'bot.on(message())',
    sessionData,
    chatId,
    shouldReply,
    username,
    userMessage
  })

  const sessionReady = await ensureSessionReady({
    ctx,
    sessionController: deps.sessionController,
    sessionData,
    chatId,
    userMessage
  })

  if (!sessionReady) return

  const mediaDeps = {
    telegram: ctx.telegram,
    botToken: deps.env.BOT_TOKEN,
    fileClient: deps.telegramFileClient
  }

  const imageInputs = await collectImageInputs(ctx, mediaDeps)

  const caption =
    ctx.message &&
    'caption' in ctx.message &&
    typeof ctx.message.caption === 'string'
      ? ctx.message.caption
      : ''
  const message = `${caption || userMessage}`
  const trimmedMessage = message.trim()

  const content = composeUserContent({
    username,
    trimmedMessage,
    imageInputs
  })

  const newMessage: OpenAI.Responses.ResponseInputItem.Message =
    createUserMessage(content)

  const loggedMessage = createLoggedMessage(newMessage)

  console.log({
    log: 'newMessage',
    newMessage: loggedMessage
  })

  if (message.length > 10 && sessionData.toggle_history) {
    await deps.embeddingService.saveMessage(
      chatId,
      'user',
      `${username}: ${message}`
    )
  }

  if (!shouldReply) return

  let relativeMessage: (RecordMetadata | undefined)[] = []

  if (sessionData.toggle_history) {
    relativeMessage = await deps.embeddingService.fetchRelevantMessages(
      chatId,
      message
    )
  }

  console.log({
    log: 'relativeMessage',
    relativeMessage
  })

  let formattedMemories: OpenAI.Responses.ResponseInputItem.Message[] = []

  if (sessionData.toggle_history) {
    formattedMemories = deps.sessionController.getFormattedMemories()
  }

  console.log({
    log: 'formattedMemories',
    formattedMemories
  })

  if (!ctx.from) return
  const hasEnoughCoins = await deps.userService.hasEnoughCoins(ctx.from.id, 1)

  const historyMessages = sanitizeHistoryMessages(sessionData.userMessages)

  const botMessages = await deps.responseApi(
    [
      ...formattedMemories,
      ...relativeMessage.map(
        (item) =>
          ({
            role: 'system',
            content: [
              {
                type: 'input_text',
                text:
                  item &&
                  typeof item === 'object' &&
                  'content' in item &&
                  typeof item.content === 'string'
                    ? item.content
                    : ''
              }
            ]
          }) as unknown as OpenAI.Responses.ResponseOutputMessage
      ),
      ...historyMessages,
      newMessage
    ],
    {
      hasEnoughCoins,
      model: sessionData.model,
      prompt: sessionData.prompt
    }
  )

  console.log({
    log: 'botMessages',
    botMessages
  })

  if (!botMessages) return

  const memoryItems = extractMemoryItems(botMessages)

  console.log({
    log: 'memoryItems',
    memoryItems
  })

  if (sessionData.toggle_history) {
    for (const memoryItem of memoryItems) {
      await deps.sessionController.addMemory(chatId, memoryItem.content)
    }
  }

  const responseMessages = filterResponseMessages(botMessages)

  const messages = [
    ...historyMessages,
    newMessage,
    ...buildAssistantHistoryMessages(botMessages)
  ]

  if (sessionData.toggle_history) {
    const sanitizedForStorage = sanitizeHistoryMessages(messages)
    await deps.sessionController.updateSession(chatId, {
      userMessages: sanitizedForStorage.slice(-20)
    })
  }

  await ctx.telegram.sendChatAction(
    chatId,
    'typing',
    sessionData.chat_settings.send_message_option
  )
  await delay()
  await dispatchResponsesSequentially(responseMessages, {
    ctx,
    sessionData,
    userService: deps.userService,
    env: deps.env
  })
}
