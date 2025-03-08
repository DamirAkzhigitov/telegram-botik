import { Context, SessionData } from '../types'

export class SessionController {
	session: SessionData
	env: Context

	constructor(env: Context) {
		this.session = { userMessages: [], prompt: 'Отвечай на греческом' }
		this.env = env
	}

	async getSession(chatId: string): Promise<SessionData> {
		try {
			const data = await this.env.CHAT_SESSIONS_STORAGE.get(`session_${chatId}`)
			return data ? JSON.parse(data) : this.session
		} catch (e) {
			console.error('getSession error', e)
			return this.session
		}
	}

	async updateSession(
		chatId: number,
		value: Partial<SessionData>,
	): Promise<void> {
		try {
			await this.env.CHAT_SESSIONS_STORAGE.put(
				`session_${chatId}`,
				JSON.stringify({
					...this.session,
					...value,
				}),
			)
		} catch (e) {
			console.error('update session error', e)
		}
	}
}
