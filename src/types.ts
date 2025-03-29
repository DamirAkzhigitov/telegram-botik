import { TelegramEmoji } from 'telegraf/types'
import OpenAI from 'openai'

export interface MemoryResponse {
  type: 'memory'
  content: string
}

export interface MessageContent {
  message: string
  chat_id: number
  message_id: number
  timestamp: string
}

export interface Memory {
  content: string
  timestamp: string
}

export interface SessionData {
  userMessages: (
    | OpenAI.Chat.ChatCompletionUserMessageParam
    | OpenAI.Chat.ChatCompletionMessage
  )[]
  stickersPacks: string[]
  // prompt: string
  firstTime: boolean
  // promptNotSet: boolean
  stickerNotSet: boolean
  lastUserMessageTime?: string
  lastBotMessageTime?: string
  lastMessageFromBot?: boolean
  reflection?: string
  // replyChance: string
  // memories: Memory[] // Added memories array
}

export interface Context {
  API_KEY: string
  BOT_KEY: string
  CHAT_SESSIONS_STORAGE: KVNamespace
}

export interface Sticker {
  emoji: string | undefined
  set_name: string
  file_id: string
}

export type ResponseType = 'message' | 'emoji' | 'selfChange'

export interface EmojiResponse {
  type: 'reaction'
  content: TelegramEmoji
}

export interface Message {
  type: ResponseType
  content: string
}

export interface MemoryResponse {
  type: 'memory'
  content: string
}

export type MessagesArray = (Message | EmojiResponse | MemoryResponse)[]

export interface BotReply {
  type: 'message' | 'emoji' | 'reaction' | 'memory'
  content: string
  chat_id: number
  message_id: number
}
