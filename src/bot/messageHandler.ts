import type { Context } from 'telegraf'
import OpenAI from 'openai'
import type { AxiosInstance } from 'axios'
import { EmbeddingService } from '../service/EmbeddingService'
import { SessionController } from '../service/SessionController'
import { UserService } from '../service/UserService'
import type { MessagesArray, SessionData } from '../types'
import {
  composeUserContent,
  createLoggedMessage,
  createUserMessage,
  extractMemoryItems,
  filterResponseMessages,
  joinVisibleAssistantText
} from './messageBuilder'
import { resolveMoodForInjection, updateMoodAfterAddressedTurn } from './mood'
import {
  sanitizeHistoryMessages,
  buildAssistantHistoryMessages,
  persistConversationHistory
} from './history'
import { collectImageInputs } from './media'
import { ensureSessionReady } from './sessionGuards'
import {
  dispatchResponsesSequentially,
  resolveSendExtras
} from './responseDispatcher'
import { delay } from '../utils'
import { BOT_NAME } from './constants'
import { resolveShouldReplyDirected } from './addressed'
import { resolveThreadActivityKey } from './threadActivity'
import {
  extractBackgroundMemories,
  formatRecentHistoryForObserver,
  plainTextFromHistoryMessage
} from './memoryObserver'
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
    moodText?: string
  }
) => Promise<MessagesArray | null>

function isForumChat(ctx: Context, sessionData: SessionData): boolean {
  return (
    (ctx.chat?.type === 'supergroup' &&
      'is_forum' in ctx.chat &&
      ctx.chat.is_forum === true) ||
    sessionData.is_forum_supergroup === true
  )
}

/**
 * Legacy: non-forum chats use `send_message_option` as-is (`undefined`).
 * Forum supergroups: use the trigger message’s topic (or `null` to drop a fixed `message_thread_id`).
 * Directed mode: always `number` | `null` (same as forum send semantics, including DMs).
 */
function resolveOutboundMessageThreadId(
  ctx: Context,
  sessionData: SessionData,
  directedOn: boolean
): number | null | undefined {
  const msg = ctx.message
  const threadId =
    msg &&
    'message_thread_id' in msg &&
    typeof msg.message_thread_id === 'number'
      ? msg.message_thread_id
      : undefined

  if (directedOn) {
    return threadId !== undefined ? threadId : null
  }

  if (!isForumChat(ctx, sessionData)) {
    return undefined
  }

  return threadId !== undefined ? threadId : null
}

interface MessageHandlerDeps {
  env: Env
  responseApi: ResponseApi
  embeddingService: EmbeddingService
  sessionController: SessionController
  userService: UserService
  telegramFileClient: AxiosInstance
  openai: OpenAI
  /** Workers: defer mood persistence so the webhook can return 200 before the mood LLM finishes. */
  waitUntil?: (promise: Promise<unknown>) => void
}

function logIncomingMessageCtx(ctx: Context) {
  const m = ctx.message
  console.log('incoming message', {
    chatId: ctx.chat?.id,
    chatType: ctx.chat?.type,
    messageId: m && 'message_id' in m ? m.message_id : undefined,
    threadId: m && 'message_thread_id' in m ? m.message_thread_id : undefined,
    fromId: m && 'from' in m ? m.from?.id : undefined,
    hasText: Boolean(
      m && 'text' in m && typeof (m as { text?: string }).text === 'string'
    )
  })
}

export const handleIncomingMessage = async (
  ctx: Context,
  deps: MessageHandlerDeps
) => {
  logIncomingMessageCtx(ctx)
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

  await deps.sessionController.touchThreadActivity(
    chatId,
    resolveThreadActivityKey(ctx)
  )

  await deps.sessionController.removeProactivePendingKey(
    chatId,
    resolveThreadActivityKey(ctx)
  )

  if (
    ctx.chat?.type === 'supergroup' &&
    'is_forum' in ctx.chat &&
    ctx.chat.is_forum === true &&
    sessionData.is_forum_supergroup !== true
  ) {
    await deps.sessionController.updateSession(chatId, {
      is_forum_supergroup: true
    })
  }

  const directedOn = Boolean(sessionData.chat_settings.directed_reply_gating)

  /** Legacy thread gate applies to forum/supergroup threads only — not DMs (§2 / UX). */
  const legacyThreadAllowsReply =
    ctx.chat?.type === 'private'
      ? true
      : sessionData.chat_settings.reply_only_in_thread
        ? ctx.message?.message_thread_id === sessionData.chat_settings.thread_id
        : true

  const shouldReply = directedOn
    ? await resolveShouldReplyDirected(ctx, deps.openai)
    : legacyThreadAllowsReply

  const isForum = isForumChat(ctx, sessionData)

  const historyThreadPrefix =
    (directedOn || isForum) &&
    ctx.message &&
    'message_thread_id' in ctx.message &&
    typeof ctx.message.message_thread_id === 'number'
      ? `[forum_thread_id=${ctx.message.message_thread_id}]\n`
      : undefined

  const outboundMessageThreadId = resolveOutboundMessageThreadId(
    ctx,
    sessionData,
    directedOn
  )

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
    imageInputs,
    historyThreadPrefix
  })

  const newMessage: OpenAI.Responses.ResponseInputItem.Message =
    createUserMessage(content)

  const loggedMessage = createLoggedMessage(newMessage)

  console.log({
    log: 'newMessage',
    newMessage: loggedMessage
  })

  const historyMessages = sanitizeHistoryMessages(sessionData.userMessages)

  if (!shouldReply) {
    if (sessionData.toggle_history) {
      const messagesWithNew = [...historyMessages, newMessage]
      await persistConversationHistory({
        chatId,
        messages: messagesWithNew,
        toggleHistory: true,
        sessionController: deps.sessionController,
        embeddingService: deps.embeddingService,
        openai: deps.openai,
        model: sessionData.model
      })

      const latestUserLine = plainTextFromHistoryMessage(newMessage)
      const recentTranscript = formatRecentHistoryForObserver(messagesWithNew)
      const existingMemorySnippets = (sessionData.memories ?? [])
        .slice(-5)
        .map((m) => m.content)

      const backgroundMemories = await extractBackgroundMemories(deps.openai, {
        latestUserLine,
        recentTranscript,
        existingMemorySnippets
      })
      for (const content of backgroundMemories) {
        await deps.sessionController.addMemory(chatId, content)
      }
    }
    return
  }

  let relativeMessage: (RecordMetadata | undefined)[] = []

  if (sessionData.toggle_history) {
    relativeMessage = await deps.embeddingService.fetchRelevantSummaries(
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

  const previousMoodForTurn = resolveMoodForInjection(sessionData.chat_settings)

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
      prompt: sessionData.prompt,
      moodText: previousMoodForTurn
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

  await persistConversationHistory({
    chatId,
    messages,
    toggleHistory: sessionData.toggle_history,
    sessionController: deps.sessionController,
    embeddingService: deps.embeddingService,
    openai: deps.openai,
    model: sessionData.model
  })

  const typingExtras = resolveSendExtras(sessionData, outboundMessageThreadId)

  await ctx.telegram.sendChatAction(chatId, 'typing', typingExtras)
  await delay()
  await dispatchResponsesSequentially(responseMessages, {
    ctx,
    sessionData,
    userService: deps.userService,
    env: deps.env,
    outboundMessageThreadId
  })

  const runMoodPipeline = async () => {
    try {
      const assistantVisible = joinVisibleAssistantText(responseMessages)
      const newMood = await updateMoodAfterAddressedTurn(deps.openai, {
        userLine: message.slice(0, 4000),
        assistantVisible,
        previousMood: previousMoodForTurn,
        previousMoodUpdatedAt: sessionData.chat_settings.mood_updated_at
      })
      if (newMood && newMood.trim() !== (previousMoodForTurn ?? '').trim()) {
        await deps.sessionController.updateSession(chatId, {
          chat_settings: {
            mood_text: newMood,
            mood_updated_at: new Date().toISOString()
          }
        })
        await deps.sessionController.addMemory(chatId, `Настроение: ${newMood}`)
      }
    } catch (e) {
      console.error('mood update pipeline', e)
    }
  }

  if (deps.waitUntil) {
    deps.waitUntil(runMoodPipeline())
  } else {
    await runMoodPipeline()
  }
}
