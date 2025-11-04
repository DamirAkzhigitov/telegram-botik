import { Telegraf } from 'telegraf'
import type { Context } from 'telegraf'
import OpenAI from 'openai'
import type { AxiosInstance } from 'axios'
import { EmbeddingService } from '../service/EmbeddingService'
import { SessionController } from '../service/SessionController'
import { UserService } from '../service/UserService'
import type { QueuedMessageItem } from '../types'
import {
  composeUserContent,
  createUserMessage,
  extractMemoryItems,
  filterResponseMessages
} from './messageBuilder'
import {
  buildAssistantHistoryMessages,
  createConversationSummary,
  createSummaryMessage,
  sanitizeHistoryMessages
} from './history'
import { dispatchResponsesSequentially } from './responseDispatcher'
import { delay } from '../utils'
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
) => Promise<import('../types').MessagesArray | null>

interface ProcessMessageDeps {
  env: Env
  responseApi: ResponseApi
  embeddingService: EmbeddingService
  sessionController: SessionController
  userService: UserService
  telegramFileClient: AxiosInstance
  openai: OpenAI
}

/**
 * Processes a single queued message item
 * This contains the core message processing logic extracted from handleIncomingMessage
 */
export async function processQueuedMessage(
  chatId: number,
  messageItem: QueuedMessageItem,
  deps: ProcessMessageDeps
): Promise<void> {
  const bot = new Telegraf(deps.env.BOT_TOKEN, {
    telegram: { webhookReply: false }
  })

  const sessionData = await deps.sessionController.getSession(chatId)

  const message =
    messageItem.stickerDescription ||
    messageItem.stickerEmoji ||
    messageItem.caption ||
    messageItem.content
  const trimmedMessage = message.trim()

  if (!trimmedMessage) {
    console.warn(`Empty message for chat ${chatId}, skipping`)
    return
  }

  const content = composeUserContent({
    username: messageItem.username,
    trimmedMessage,
    imageInputs: messageItem.imageInputs ?? []
  })

  const newMessage: OpenAI.Responses.ResponseInputItem.Message =
    createUserMessage(content)

  console.log({
    log: 'processQueuedMessage',
    chatId,
    username: messageItem.username,
    content: trimmedMessage
  })

  let relativeMessage: (RecordMetadata | undefined)[] = []
  if (sessionData.toggle_history) {
    relativeMessage = await deps.embeddingService.fetchRelevantSummaries(
      chatId,
      trimmedMessage
    )
  }

  let formattedMemories: OpenAI.Responses.ResponseInputItem.Message[] = []
  if (sessionData.toggle_history) {
    formattedMemories = deps.sessionController.getFormattedMemories()
  }

  const hasEnoughCoins = await deps.userService.hasEnoughCoins(
    messageItem.userId,
    1
  )

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

  if (!botMessages) {
    console.warn(`No bot messages returned for chat ${chatId}`)
    return
  }

  const memoryItems = extractMemoryItems(botMessages)
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

    if (sanitizedForStorage.length >= 20) {
      const messagesToSummarize = sanitizedForStorage.slice(-20)

      try {
        const summaryText = await createConversationSummary(
          messagesToSummarize,
          deps.openai,
          sessionData.model
        )

        await deps.embeddingService.saveSummary(chatId, summaryText)

        const summaryMessage = createSummaryMessage(summaryText)
        const remainingMessages = sanitizedForStorage.slice(0, -20)
        const newHistory = [...remainingMessages, ...summaryMessage]

        await deps.sessionController.updateSession(chatId, {
          userMessages: newHistory
        })
      } catch (error) {
        console.error('Error creating summary:', error)
        await deps.sessionController.updateSession(chatId, {
          userMessages: sanitizedForStorage.slice(-20)
        })
      }
    } else {
      await deps.sessionController.updateSession(chatId, {
        userMessages: sanitizedForStorage
      })
    }
  }

  await bot.telegram.sendChatAction(
    chatId,
    'typing',
    sessionData.chat_settings.send_message_option
  )
  await delay()

  const mockCtx = {
    telegram: bot.telegram,
    chat: { id: chatId },
    message: { message_id: messageItem.messageId },
    from: {
      id: messageItem.userId,
      first_name: messageItem.userFirstName,
      last_name: messageItem.userLastName
    }
  } as unknown as Context

  await dispatchResponsesSequentially(responseMessages, {
    ctx: mockCtx,
    sessionData,
    userService: deps.userService,
    env: deps.env
  })
}
