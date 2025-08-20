import { TelegramEmoji } from 'telegraf/types'

export interface MemoryResponse {
  type: 'memory'
  content: string
}
export interface ChatMessage {
  name: string
  text: string
  time: string
}

export interface Memory {
  content: string
  timestamp: string
}

export interface SessionData {
  userMessages: ChatMessage[]
  stickersPacks: string[]
  prompt: string
  firstTime: boolean
  promptNotSet: boolean
  stickerNotSet: boolean
  replyChance: string
  memories: Memory[] // Added memories array
}

export interface Sticker {
  emoji: string | undefined
  set_name: string
  file_id: string
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
  id: number;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  coins: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number;
  user_id: number;
  action_type: string;
  coins_change: number;
  balance_before: number;
  balance_after: number;
  created_at: string;
}
