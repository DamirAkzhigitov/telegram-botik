import { Memory, SessionData } from '../types'

const defaultStickerPack = 'koshachiy_raskolbas'

export class SessionController {
  session: SessionData
  env: Env

  constructor(env: Env) {
    this.session = {
      userMessages: [],
      stickersPacks: [defaultStickerPack],
      prompt: '',
      firstTime: true,
      promptNotSet: false,
      stickerNotSet: false,
      replyChance: '0.15',
      memories: []
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
      if (!('memories' in this.session)) {
        Object.assign(this.session, { memories: [] })
      }
      return this.session
    } catch (e) {
      console.error('getSession error', e)
      return this.session
    }
  }

  async updateSession(
    chatId: string | number,
    value: Partial<SessionData>
  ): Promise<void> {
    const newSession = {
      ...this.session,
      ...value
    }
    try {
      this.session = newSession
      await this.env.CHAT_SESSIONS_STORAGE.put(
        `session_${chatId}`,
        JSON.stringify(this.session)
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
          stickersPacks: [defaultStickerPack]
        } as SessionData)
      )
    } catch (e) {
      console.error('resetStickers', e)
    }
  }

  async addMemory(chatId: string | number, content: string): Promise<void> {
    const memory: Memory = {
      content,
      timestamp: new Date().toISOString()
    }

    const memories = [memory, ...this.session.memories]

    await this.updateSession(chatId, { memories: memories.slice(0, 50) })
  }

  getFormattedMemories(): string {
    if (!this.session.memories || this.session.memories.length === 0) {
      return ''
    }

    return (
      'Important information to remember:' +
      this.session.memories.map((memory) => `- ${memory.content}`).join('')
    )
  }
}
