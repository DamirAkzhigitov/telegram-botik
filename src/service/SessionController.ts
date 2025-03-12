import { Context, Memory, SessionData } from '../types'

const defaultStickerPack = 'gufenpchela'

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
      memories: [] // Initialize empty memories array
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

  // Add memory management functions
  async addMemory(
    chatId: string | number,
    content: string,
    importance: number = 5
  ): Promise<void> {
    const memory: Memory = {
      content,
      timestamp: new Date().toISOString(),
      importance
    }

    // Get current memories and add the new one
    const session = await this.getSession(chatId)
    const memories = [...session.memories, memory]

    // Sort by importance (highest first)
    memories.sort((a, b) => b.importance - a.importance)

    // Limit to a reasonable number (e.g., 50)
    const limitedMemories = memories.slice(0, 50)

    await this.updateSession(chatId, { memories: limitedMemories })
  }

  // Get formatted memories for context
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
