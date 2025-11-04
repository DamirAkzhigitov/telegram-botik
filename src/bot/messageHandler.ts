import type { Context } from 'telegraf'
import OpenAI from 'openai'
import type { AxiosInstance } from 'axios'
import { EmbeddingService } from '../service/EmbeddingService'
import { SessionController } from '../service/SessionController'
import { UserService } from '../service/UserService'
import { MessageBufferService } from '../service/MessageBufferService'
import type { MessagesArray, QueuedMessageItem } from '../types'
import { collectImageInputs, collectStickerDescription } from './media'
import { ensureSessionReady } from './sessionGuards'
import { BOT_NAME } from './constants'

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
  openai: OpenAI
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

  let stickerDescription: string | null = null
  let stickerEmoji: string | null = null
  if (ctx.message && 'sticker' in ctx.message && ctx.message.sticker) {
    const sticker = ctx.message.sticker
    if (sticker.emoji && typeof sticker.emoji === 'string') {
      stickerEmoji = sticker.emoji
    }
    stickerDescription = await collectStickerDescription(ctx, mediaDeps, {
      openai: deps.openai
    })
  }

  const caption =
    ctx.message &&
    'caption' in ctx.message &&
    typeof ctx.message.caption === 'string'
      ? ctx.message.caption
      : ''

  const message = stickerDescription || stickerEmoji || caption || userMessage
  const trimmedMessage = message.trim()

  if (!shouldReply) return

  const messageItem: QueuedMessageItem = {
    username,
    content: trimmedMessage,
    timestamp: Date.now(),
    messageId: ctx.message?.message_id || 0,
    userId: ctx.message?.from?.id || 0,
    userFirstName: ctx.message?.from?.first_name,
    userLastName: ctx.message?.from?.last_name,
    stickerDescription: stickerDescription || null,
    stickerEmoji: stickerEmoji || null,
    caption: caption || undefined,
    imageInputs: imageInputs.length > 0 ? imageInputs : undefined
  }

  // Buffer the message instead of processing immediately
  const bufferService = new MessageBufferService(deps.env)
  const batchLimit = sessionData.chat_settings.messageBatchLimit || 10

  await bufferService.bufferMessage(chatId, messageItem, batchLimit)

  console.log({
    log: 'bufferedMessage',
    chatId,
    username,
    messageItem
  })
}
