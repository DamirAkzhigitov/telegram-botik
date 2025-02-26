export interface ChatMessage {
	username: string;
	content: string;
	timestamp: number;
}

export interface SessionData {
	userMessages: ChatMessage[];
}

export interface Sticker {
	emoji: string | undefined,
	set_name: string
	file_id: string
}
