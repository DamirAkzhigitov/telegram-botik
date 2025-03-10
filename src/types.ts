// In src/types.ts

// Adding Memory interfaces
export interface Memory {
  content: string
  timestamp: string
  importance: number // 1-10 scale to prioritize memories
}

// Update SessionData interface
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