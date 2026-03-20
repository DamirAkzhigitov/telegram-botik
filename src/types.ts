import { TelegramEmoji } from 'telegraf/types'
import OpenAI from 'openai'
import type { AllowedTextModel } from './constants/models'

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
  /** When true: ingest all messages, reply only when addressed; use trigger topic for sends. */
  directed_reply_gating?: boolean
  send_message_option?: Record<string, unknown>
  /** Stage 3: opt-in proactive revival cron (default off). */
  proactive_enabled?: boolean
  /** Hours without user activity in a thread before revival is considered; default 48. */
  proactive_stale_hours?: number
  /**
   * Stage 4: free-text mood (Russian, ≥150 chars when set). Injected into main model; updated on addressed turns.
   */
  mood_text?: string
  /** ISO time when mood_text was last set (LLM or admin). */
  mood_updated_at?: string
}

/** Last-seen activity for cron / revival (per forum topic or one default bucket). */
export interface ThreadActivityBucket {
  lastActivityAt: string
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
  toggle_history: boolean
  model?: AllowedTextModel | 'not_set'
  chat_settings: ChatSettings
  memories: Memory[] // Added memories array
  /**
   * Keys: forum topic id as decimal string, or `__default` for DMs / non-forum / forum without topic id.
   * @see resolveThreadActivityKey in bot/threadActivity.ts
   */
  thread_activity?: Record<string, ThreadActivityBucket>
  /**
   * After a proactive send, block further proactives in that thread until a user posts again.
   * Keys align with `thread_activity`.
   */
  proactive_pending?: Record<string, { sentAt: string }>
  /** Cached from Telegram: supergroup with topics (for sendMessage message_thread_id). */
  is_forum_supergroup?: boolean
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
  Memory,
  Image
}

export type ResponseType = 'text' | 'emoji' | 'image'

export interface ImageResponse {
  type: 'image'
  content: string
}

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

export type MessagesArray = (
  | Message
  | EmojiResponse
  | MemoryResponse
  | ImageResponse
)[]

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
