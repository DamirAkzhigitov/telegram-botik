import OpenAI from 'openai'

export interface SessionData {
  userMessages: (
    | OpenAI.Chat.ChatCompletionUserMessageParam
    | OpenAI.Chat.ChatCompletionMessage
  )[]
  stickersPacks: string[]
  prompt: string
  firstTime: boolean
  promptNotSet: boolean
  stickerNotSet: boolean
  lastUserMessageTime?: string
  lastBotMessageTime?: string
  lastMessageFromBot?: boolean
  reflection?: string
}

export interface Sticker {
  emoji: string | undefined
  set_name: string
  file_id: string
}

export interface BotReply {
  type: 'message' | 'emoji' | 'reaction' | 'reflection' | 'search'
  content: string
  chat_id: number
  message_id: number
}
