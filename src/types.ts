import { TelegramEmoji } from 'telegraf/types'
import OpenAI from 'openai'

export interface MemoryResponse {
  type: 'memory'
  content: string
}

export interface Memory {
  content: string
  timestamp: string
}
export interface ChatSettings {
  thread_id?: number
  reply_only_in_thread?: boolean
  send_message_option?: Record<string, any>
}

export interface SessionData {
  userMessages: (
    | OpenAI.Responses.ResponseInputItem.Message
    | OpenAI.Responses.ResponseOutputMessage
  )[]
  stickersPacks: string[]
  prompt: string
  firstTime: boolean
  promptNotSet: boolean
  stickerNotSet: boolean
  chat_settings: ChatSettings
  memories: Memory[] // Added memories array
}

export interface Sticker {
  emoji: string | undefined
  set_name: string
  file_id: string
}

export enum MessageType {
  Text,
  Emoji,
  Reaction,
  Memory
}

export type ResponseType = 'text' | 'emoji'

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

// User and coin system types
export interface User {
  id: number
  telegram_id: number
  username?: string
  first_name?: string
  last_name?: string
  coins: number
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: number
  user_id: number
  action_type: string
  coins_change: number
  balance_before: number
  balance_after: number
  created_at: string
}
