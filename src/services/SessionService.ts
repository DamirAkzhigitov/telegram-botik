import { Context, Memory, SessionData } from '../types'
import { defaultStickerPack, messages } from '../config'

const defaultSession: SessionData = {
  userMessages: [],
  stickersPacks: [defaultStickerPack],
  prompt: '',
  firstTime: true,
  promptNotSet: false,
  stickerNotSet: false,
  replyChance: '1',
  memories: []
}

export const isOnlyDefaultStickerPack = (session: SessionData) => {
  return (
    session?.stickersPacks?.length === 1 &&
    session?.stickersPacks?.includes(defaultStickerPack)
  )
}

export const getFormattedMemories = (session: SessionData): string => {
  if (!session.memories || session.memories.length === 0) {
    return ''
  }

  return (
    messages.memoriesHeader +
    session.memories.map((memory) => `- ${memory.content}`).join('')
  )
}

const getSession = async (
  env: Context,
  chatId: string | number
): Promise<SessionData> => {
  try {
    const data = await env.CHAT_SESSIONS_STORAGE.get(`session_${chatId}`)
    if (!data) {
      return defaultSession
    }
    const session = JSON.parse(data)
    if (!('memories' in session)) {
      session.memories = []
    }
    return session
  } catch (e) {
    console.error('getSession error', e)
    return defaultSession
  }
}

const updateSession = async (
  env: Context,
  chatId: string | number,
  value: Partial<SessionData>
): Promise<SessionData> => {
  const currentSession = await getSession(env, chatId)
  const newSession = {
    ...currentSession,
    ...value
  }
  try {
    await env.CHAT_SESSIONS_STORAGE.put(
      `session_${chatId}`,
      JSON.stringify(newSession)
    )
    return newSession
  } catch (e) {
    console.error('update session error', e)
    return currentSession // Return old session if update fails
  }
}

const resetStickers = async (
  env: Context,
  chatId: string | number
): Promise<SessionData> => {
  return updateSession(env, chatId, { stickersPacks: [defaultStickerPack] })
}

const addMemory = async (
  env: Context,
  chatId: string | number,
  content: string
): Promise<SessionData> => {
  const session = await getSession(env, chatId)
  const memory: Memory = {
    content,
    timestamp: new Date().toISOString()
  }
  const memories = [memory, ...session.memories].slice(0, 50)
  return updateSession(env, chatId, { memories })
}

export const createSessionService = (env: Context) => {
  return {
    getSession: (chatId: string | number) => getSession(env, chatId),
    updateSession: (
      chatId: string | number,
      value: Partial<SessionData>
    ) => updateSession(env, chatId, value),
    resetStickers: (chatId: string | number) => resetStickers(env, chatId),
    addMemory: (chatId: string | number, content: string) =>
      addMemory(env, chatId, content)
  }
}
