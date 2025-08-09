import { SessionData, ChatMessage, SessionService } from '../types'
import {
  getFormattedMemories,
  isOnlyDefaultStickerPack
} from './SessionService'
import { createGptService } from './GptService'
import { createTelegramService } from './TelegramService'
import { botInfo, defaultStickerPack, messages as messageConfig } from '../config'
import { isReply } from '../utils'

// Define the structure of the message context to be passed to the handler
import { PhotoSize } from 'telegraf/types'

export interface MessageContext {
  chatId: number | string
  from: {
    is_bot: boolean
    first_name?: string
    last_name?: string
    username?: string
  }
  text?: string
  photo?: PhotoSize[]
  sticker?: {
    set_name?: string
  }
  caption?: string
  message_id: number
}

// Define the structure for actions to be returned by the handler
export type BotAction =
  | { type: 'sendMessage'; text: string }
  | { type: 'sendSticker'; fileId: string }
  | { type: 'setReaction'; emoji: string }
  | { type: 'sendChatAction'; action: 'typing' }

export const createMessageHandler = (
  sessionService: SessionService,
  gptService: ReturnType<typeof createGptService>,
  telegramService: ReturnType<typeof createTelegramService>
) => {
  const handle = async (ctx: MessageContext): Promise<BotAction[]> => {
    if (ctx.from.is_bot) return []

    const username =
      ctx.from.first_name ||
      ctx.from.last_name ||
      ctx.from.username ||
      'Anonymous'
    const userMessage = ctx.text || ''
    let sessionData = await sessionService.getSession(ctx.chatId)
    const shouldReply =
      isReply(sessionData.replyChance) || !!userMessage.match(botInfo.username)

    const actions: BotAction[] = []

    if (sessionData.firstTime) {
      sessionData = await sessionService.updateSession(ctx.chatId, {
        firstTime: false
      })
      actions.push({ type: 'sendMessage', text: messageConfig.firstTime })
    }

    if (sessionData.promptNotSet) {
      sessionData = await sessionService.updateSession(ctx.chatId, {
        prompt: userMessage,
        promptNotSet: false
      })
      actions.push({ type: 'sendMessage', text: messageConfig.promptUpdated })
      return actions
    }

    if (sessionData.stickerNotSet) {
      if (ctx.sticker?.set_name) {
        const onlyDefault = isOnlyDefaultStickerPack(sessionData)
        let newPack = sessionData.stickersPacks
        if (onlyDefault) {
          newPack = [ctx.sticker.set_name]
        } else {
          newPack.push(ctx.sticker.set_name)
        }
        sessionData = await sessionService.updateSession(ctx.chatId, {
          stickersPacks: newPack,
          stickerNotSet: false
        })
        actions.push({
          type: 'sendMessage',
          text: messageConfig.stickerPackAdded
        })
        return actions
      } else {
        sessionData = await sessionService.updateSession(ctx.chatId, {
          stickersPacks: [defaultStickerPack],
          stickerNotSet: false
        })
      }
    }

    let image = ''
    if (ctx.photo) {
      image = await telegramService.getPhotoBase64(ctx.photo)
    }

    const currentTime = new Date()
    const newMessage: ChatMessage = {
      name: username,
      text: ctx.caption || userMessage,
      time: currentTime.toISOString()
    }

    const formattedMemories = getFormattedMemories(sessionData)
    const recentMessages = [...sessionData.userMessages]
      .map((m) => `${m.name}[${m.time}]: ${m.text};`)
      .join(';')

    const botMessages = await gptService.generateResponse(
      `${newMessage.name}[${newMessage.time}] написал: ${newMessage.text}`,
      recentMessages,
      sessionData.prompt,
      image,
      formattedMemories
    )

    const memoryItems = botMessages.filter((item) => item.type === 'memory')
    for (const memoryItem of memoryItems) {
      sessionData = await sessionService.addMemory(
        ctx.chatId,
        memoryItem.content
      )
    }

    const responseMessages = botMessages.filter(
      (item) => item.type !== 'memory'
    )
    const botHistoryText = responseMessages
      .filter(({ type }) => type === 'text')
      .map(({ content }) => content)
      .join('')

    const userMessages = [...sessionData.userMessages]
    userMessages.unshift(newMessage)
    if (botHistoryText && shouldReply) {
      userMessages.unshift({
        text: botHistoryText,
        time: currentTime.toISOString(),
        name: botInfo.name
      })
    }

    await sessionService.updateSession(ctx.chatId, {
      userMessages: userMessages.slice(0, 20)
    })

    if (shouldReply) {
      actions.push({ type: 'sendChatAction', action: 'typing' })
    }

    for (const { content, type } of responseMessages) {
      if (type === 'emoji' && shouldReply) {
        const sticker = await telegramService.getStickerByEmoji(
          sessionData.stickersPacks,
          content
        )
        if (sticker) {
          actions.push({ type: 'sendSticker', fileId: sticker.file_id })
        }
      } else if (type === 'text' && shouldReply) {
        actions.push({ type: 'sendMessage', text: content })
      } else if (type === 'reaction') {
        actions.push({ type: 'setReaction', emoji: content })
      }
    }

    return actions
  }

  return {
    handle
  }
}
