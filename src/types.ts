import { TelegramEmoji } from 'telegraf/types'

export interface ChatMessage {
	name: string
	text: string
	time: string
}

export interface SessionData {
	userMessages: ChatMessage[]
	prompt: string
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

export type MessagesArray = (Message | EmojiResponse)[]
