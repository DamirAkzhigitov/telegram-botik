import { Memory, SessionData } from '../types'
import OpenAI from 'openai'
import { DEFAULT_TEXT_MODEL, resolveModelChoice } from '../constants/models'

const defaultStickerPack = 'koshachiy_raskolbas'

const defaultSettings = {
  thread_id: undefined,
  reply_only_in_thread: false,
  send_message_option: {}
}

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
      model: DEFAULT_TEXT_MODEL,
      toggle_history: true,
      memories: [],
      chat_settings: defaultSettings
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
      if (!this.session.model) {
        this.session.model = DEFAULT_TEXT_MODEL
      } else if (this.session.model !== 'not_set') {
        this.session.model = resolveModelChoice(this.session.model)
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
    const sanitizedValue = { ...value }
    if (sanitizedValue.model && sanitizedValue.model !== 'not_set') {
      sanitizedValue.model = resolveModelChoice(sanitizedValue.model)
    }

    const newSession = {
      ...this.session,
      ...sanitizedValue
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

    const memories = [...this.session.memories, memory]

    await this.updateSession(chatId, { memories: memories.slice(-50) })
  }

  getFormattedMemories(): OpenAI.Responses.ResponseInputItem.Message[] {
    if (!this.session.memories || this.session.memories.length === 0) {
      return []
    }

    return this.session.memories.map((memory) => ({
      role: 'system',
      content: [
        {
          type: 'input_text',
          text: memory.content
        }
      ]
    }))
  }
}
