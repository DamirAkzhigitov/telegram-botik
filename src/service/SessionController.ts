import { Context, SessionData } from '../types'

const defaultStickerPack = 'kreksshpeks'

export class SessionController {
	session: SessionData
	env: Context

	constructor(env: Context) {
		this.session = {
			userMessages: [],
			stickersPacks: [defaultStickerPack],
			prompt: '',
			firstTime: true,
			promptNotSet: false,
			stickerNotSet: false,
			replyChance: '1',
		}
		this.env = env
	}

	isOnlyDefaultStickerPack() {
		return (
			this.session?.stickersPacks?.length === 1 &&
			this.session?.stickersPacks?.includes(defaultStickerPack)
		)
	}

	async getSession(chatId: string | number): Promise<SessionData> {
		try {
			const data = await this.env.CHAT_SESSIONS_STORAGE.get(`session_${chatId}`)
			if (data) this.session = JSON.parse(data)

			return this.session
		} catch (e) {
			console.error('getSession error', e)
			return this.session
		}
	}

	async updateSession(
		chatId: string | number,
		value: Partial<SessionData>,
	): Promise<void> {
		const newSession = {
			...this.session,
			...value,
		}
		try {
			this.session = newSession
			await this.env.CHAT_SESSIONS_STORAGE.put(
				`session_${chatId}`,
				JSON.stringify(this.session),
			)
		} catch (e) {
			console.error('update session error', e)
		}
	}

	async resetStickers(chatId: string | number) {
		try {
			await this.env.CHAT_SESSIONS_STORAGE.put(
				`session_${chatId}`,
				JSON.stringify({
					...this.session,
					stickersPacks: [defaultStickerPack],
				} as SessionData),
			)
		} catch (e) {
			console.error('resetStickers', e)
		}
	}
}
