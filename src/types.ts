import { TelegramEmoji } from 'telegraf/types';

export interface ChatMessage {
	username: string;
	content: string;
	timestamp: number;
}

export interface SessionData {
	userMessages: ChatMessage[];
}

export interface Sticker {
	emoji: string | undefined;
	set_name: string;
	file_id: string;
}

export type ResponseType = 'text' | 'emoji';

export interface EmojiResponse {
	type: 'reaction';
	content: TelegramEmoji;
}

export interface Message {
	type: ResponseType;
	content: string;
}

export type MessagesArray = (Message | EmojiResponse)[];
