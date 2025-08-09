import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSessionService } from '../../src/services/SessionService'
import { Context, SessionData } from '../../src/types'

const mockKvStore = {
  get: vi.fn(),
  put: vi.fn()
}

const mockEnv = {
  CHAT_SESSIONS_STORAGE: mockKvStore
} as unknown as Context

describe('SessionService', () => {
  const sessionService = createSessionService(mockEnv)
  const chatId = 123

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return default session when no session is in KV', async () => {
    mockKvStore.get.mockResolvedValue(null)
    const session = await sessionService.getSession(chatId)
    expect(session.firstTime).toBe(true)
    expect(mockKvStore.get).toHaveBeenCalledWith(`session_${chatId}`)
  })

  it('should return existing session from KV', async () => {
    const existingSession: Partial<SessionData> = {
      firstTime: false,
      prompt: 'test prompt'
    }
    mockKvStore.get.mockResolvedValue(JSON.stringify(existingSession))
    const session = await sessionService.getSession(chatId)
    expect(session.firstTime).toBe(false)
    expect(session.prompt).toBe('test prompt')
  })

  it('should update session in KV', async () => {
    const existingSession: Partial<SessionData> = {
      firstTime: true
    }
    mockKvStore.get.mockResolvedValue(JSON.stringify(existingSession))
    const newSessionData = { firstTime: false }
    await sessionService.updateSession(chatId, newSessionData)
    expect(mockKvStore.put).toHaveBeenCalledWith(
      `session_${chatId}`,
      JSON.stringify({ ...existingSession, ...newSessionData })
    )
  })

  it('should add a memory to the session', async () => {
    const existingSession: SessionData = {
      userMessages: [],
      stickersPacks: [],
      prompt: '',
      firstTime: false,
      promptNotSet: false,
      stickerNotSet: false,
      replyChance: '1',
      memories: []
    }
    mockKvStore.get.mockResolvedValue(JSON.stringify(existingSession))
    await sessionService.addMemory(chatId, 'new memory')
    const updatedSession = JSON.parse(mockKvStore.put.mock.calls[0][1])
    expect(updatedSession.memories.length).toBe(1)
    expect(updatedSession.memories[0].content).toBe('new memory')
  })
})
