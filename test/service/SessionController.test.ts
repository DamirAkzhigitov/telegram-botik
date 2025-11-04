import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SessionController } from '../../src/service/SessionController'
import type { SessionData } from '../../src/types'
import { DEFAULT_TEXT_MODEL, ALLOWED_TEXT_MODELS } from '../../src/constants/models'

const defaultStickerPack = 'koshachiy_raskolbas'

describe('SessionController', () => {
  let mockEnv: Env
  let mockStorage: KVNamespace<string>
  let sessionController: SessionController

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    mockStorage = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn()
    } as any

    mockEnv = {
      CHAT_SESSIONS_STORAGE: mockStorage
    } as Env

    sessionController = new SessionController(mockEnv)
  })

  describe('constructor', () => {
    it('should initialize with default session data', () => {
      expect(sessionController.session).toEqual({
        userMessages: [],
        stickersPacks: [defaultStickerPack],
        prompt: '',
        firstTime: true,
        promptNotSet: false,
        stickerNotSet: false,
        model: DEFAULT_TEXT_MODEL,
        toggle_history: true,
        memories: [],
        chat_settings: {
          thread_id: undefined,
          reply_only_in_thread: false,
          send_message_option: {},
          messageBatchLimit: 10
        }
      })
    })

    it('should store env reference', () => {
      expect(sessionController.env).toBe(mockEnv)
    })
  })

  describe('isOnlyDefaultStickerPack', () => {
    it('should return true when only default pack exists', () => {
      sessionController.session.stickersPacks = [defaultStickerPack]
      expect(sessionController.isOnlyDefaultStickerPack()).toBe(true)
    })

    it('should return false when multiple packs exist', () => {
      sessionController.session.stickersPacks = [
        defaultStickerPack,
        'other_pack'
      ]
      expect(sessionController.isOnlyDefaultStickerPack()).toBe(false)
    })

    it('should return false when no default pack exists', () => {
      sessionController.session.stickersPacks = ['other_pack']
      expect(sessionController.isOnlyDefaultStickerPack()).toBe(false)
    })

    it('should return false when packs array is empty', () => {
      sessionController.session.stickersPacks = []
      expect(sessionController.isOnlyDefaultStickerPack()).toBe(false)
    })
  })

  describe('getSession', () => {
    it('should return default session when no stored data exists', async () => {
      vi.mocked(mockStorage.get).mockResolvedValue(null)

      const result = await sessionController.getSession(123)

      expect(mockStorage.get).toHaveBeenCalledWith('session_123')
      expect(result).toEqual(sessionController.session)
    })

    it('should parse and return stored session data', async () => {
      const storedSession: SessionData = {
        userMessages: [],
        stickersPacks: ['pack1'],
        prompt: 'Test prompt',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: ALLOWED_TEXT_MODELS[1],
        chat_settings: {
          thread_id: 999,
          reply_only_in_thread: true,
          send_message_option: { parse_mode: 'HTML' },
          messageBatchLimit: 10
        },
        memories: []
      }

      vi.mocked(mockStorage.get).mockResolvedValue(
        JSON.stringify(storedSession)
      )

      const result = await sessionController.getSession(456)

      expect(mockStorage.get).toHaveBeenCalledWith('session_456')
      expect(result).toEqual(storedSession)
      expect(sessionController.session).toEqual(storedSession)
    })

    it('should add memories array if missing', async () => {
      const storedSessionWithoutMemories: Partial<SessionData> = {
        userMessages: [],
        stickersPacks: ['pack1'],
        prompt: 'Test',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: DEFAULT_TEXT_MODEL,
        chat_settings: {}
      }

      vi.mocked(mockStorage.get).mockResolvedValue(
        JSON.stringify(storedSessionWithoutMemories)
      )

      const result = await sessionController.getSession(789)

      expect(result.memories).toEqual([])
      expect('memories' in result).toBe(true)
    })

    it('should set default model if model is missing', async () => {
      const storedSessionWithoutModel: Partial<SessionData> = {
        userMessages: [],
        stickersPacks: ['pack1'],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        chat_settings: {},
        memories: []
      }

      vi.mocked(mockStorage.get).mockResolvedValue(
        JSON.stringify(storedSessionWithoutModel)
      )

      const result = await sessionController.getSession(999)

      expect(result.model).toBe(DEFAULT_TEXT_MODEL)
    })

    it('should set default messageBatchLimit if missing', async () => {
      const storedSessionWithoutBatchLimit: Partial<SessionData> = {
        userMessages: [],
        stickersPacks: ['pack1'],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: DEFAULT_TEXT_MODEL,
        chat_settings: {
          thread_id: undefined,
          reply_only_in_thread: false,
          send_message_option: {}
        },
        memories: []
      }

      vi.mocked(mockStorage.get).mockResolvedValue(
        JSON.stringify(storedSessionWithoutBatchLimit)
      )

      const result = await sessionController.getSession(999)

      expect(result.chat_settings.messageBatchLimit).toBe(10)
    })

    it('should preserve existing messageBatchLimit', async () => {
      const storedSessionWithBatchLimit: Partial<SessionData> = {
        userMessages: [],
        stickersPacks: ['pack1'],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: DEFAULT_TEXT_MODEL,
        chat_settings: {
          thread_id: undefined,
          reply_only_in_thread: false,
          send_message_option: {},
          messageBatchLimit: 5
        },
        memories: []
      }

      vi.mocked(mockStorage.get).mockResolvedValue(
        JSON.stringify(storedSessionWithBatchLimit)
      )

      const result = await sessionController.getSession(999)

      expect(result.chat_settings.messageBatchLimit).toBe(5)
    })

    it('should resolve model choice for existing model', async () => {
      const storedSession: SessionData = {
        userMessages: [],
        stickersPacks: ['pack1'],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: ALLOWED_TEXT_MODELS[1],
        chat_settings: {},
        memories: []
      }

      vi.mocked(mockStorage.get).mockResolvedValue(
        JSON.stringify(storedSession)
      )

      const result = await sessionController.getSession(111)

      expect(result.model).toBe(ALLOWED_TEXT_MODELS[1])
    })

    it('should keep model as not_set if set to not_set', async () => {
      const storedSession: SessionData = {
        userMessages: [],
        stickersPacks: ['pack1'],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: 'not_set',
        chat_settings: {},
        memories: []
      }

      vi.mocked(mockStorage.get).mockResolvedValue(
        JSON.stringify(storedSession)
      )

      const result = await sessionController.getSession(222)

      expect(result.model).toBe('not_set')
    })

    it('should handle parse errors gracefully', async () => {
      vi.mocked(mockStorage.get).mockResolvedValue('invalid json')

      const result = await sessionController.getSession(333)

      expect(console.error).toHaveBeenCalledWith(
        'getSession error',
        expect.any(Error)
      )
      expect(result).toEqual(sessionController.session)
    })

    it('should handle storage get errors gracefully', async () => {
      vi.mocked(mockStorage.get).mockRejectedValue(
        new Error('Storage error')
      )

      const result = await sessionController.getSession(444)

      expect(console.error).toHaveBeenCalledWith(
        'getSession error',
        expect.any(Error)
      )
      expect(result).toEqual(sessionController.session)
    })
  })

  describe('updateSession', () => {
    it('should update session and persist to storage', async () => {
      const chatId = 555
      const updates: Partial<SessionData> = {
        prompt: 'New prompt',
        firstTime: false
      }

      await sessionController.updateSession(chatId, updates)

      expect(sessionController.session.prompt).toBe('New prompt')
      expect(sessionController.session.firstTime).toBe(false)
      expect(mockStorage.put).toHaveBeenCalledWith(
        `session_${chatId}`,
        JSON.stringify(sessionController.session)
      )
    })

    it('should sanitize model value before updating', async () => {
      const chatId = 666
      await sessionController.updateSession(chatId, {
        model: ALLOWED_TEXT_MODELS[1]
      })

      expect(sessionController.session.model).toBe(ALLOWED_TEXT_MODELS[1])
      expect(mockStorage.put).toHaveBeenCalled()
    })

    it('should keep not_set model as is', async () => {
      const chatId = 777
      await sessionController.updateSession(chatId, {
        model: 'not_set'
      })

      expect(sessionController.session.model).toBe('not_set')
    })

    it('should merge updates with existing session', async () => {
      sessionController.session.prompt = 'Old prompt'
      sessionController.session.firstTime = true

      await sessionController.updateSession(888, {
        firstTime: false
      })

      expect(sessionController.session.prompt).toBe('Old prompt')
      expect(sessionController.session.firstTime).toBe(false)
    })

    it('should handle storage put errors gracefully', async () => {
      vi.mocked(mockStorage.put).mockRejectedValue(
        new Error('Storage error')
      )

      await sessionController.updateSession(999, {
        prompt: 'Should fail'
      })

      expect(console.error).toHaveBeenCalledWith(
        'update session error',
        expect.any(Error)
      )
      // Session should still be updated locally despite storage error
      expect(sessionController.session.prompt).toBe('Should fail')
    })

    it('should work with string chatId', async () => {
      const chatId = 'string-chat-id'
      await sessionController.updateSession(chatId, {
        prompt: 'Test'
      })

      expect(mockStorage.put).toHaveBeenCalledWith(
        `session_${chatId}`,
        JSON.stringify(sessionController.session)
      )
    })
  })

  describe('resetStickers', () => {
    it('should reset stickers to default pack and persist', async () => {
      sessionController.session.stickersPacks = ['pack1', 'pack2', 'pack3']
      const chatId = 1111

      await sessionController.resetStickers(chatId)

      expect(mockStorage.put).toHaveBeenCalledWith(
        `session_${chatId}`,
        JSON.stringify({
          ...sessionController.session,
          stickersPacks: [defaultStickerPack]
        })
      )
    })

    it('should handle storage errors gracefully', async () => {
      vi.mocked(mockStorage.put).mockRejectedValue(
        new Error('Storage error')
      )

      await sessionController.resetStickers(2222)

      expect(console.error).toHaveBeenCalledWith(
        'resetStickers',
        expect.any(Error)
      )
    })

    it('should work with string chatId', async () => {
      const chatId = 'string-id'
      await sessionController.resetStickers(chatId)

      expect(mockStorage.put).toHaveBeenCalledWith(
        `session_${chatId}`,
        expect.any(String)
      )
    })
  })

  describe('addMemory', () => {
    it('should add memory to session and persist', async () => {
      const chatId = 3333
      const content = 'Test memory content'
      sessionController.session.memories = []

      await sessionController.addMemory(chatId, content)

      expect(sessionController.session.memories).toHaveLength(1)
      expect(sessionController.session.memories[0].content).toBe(content)
      expect(
        sessionController.session.memories[0].timestamp
      ).toBeDefined()
      expect(mockStorage.put).toHaveBeenCalled()
    })

    it('should limit memories to last 50 items', async () => {
      const chatId = 4444
      // Create 55 memories
      sessionController.session.memories = Array.from(
        { length: 55 },
        (_, i) => ({
          content: `Old memory ${i}`,
          timestamp: new Date().toISOString()
        })
      )

      await sessionController.addMemory(chatId, 'New memory')

      expect(sessionController.session.memories).toHaveLength(50)
      expect(
        sessionController.session.memories[
          sessionController.session.memories.length - 1
        ].content
      ).toBe('New memory')
      expect(
        sessionController.session.memories[0].content
      ).not.toBe('Old memory 0') // First items should be removed
    })

    it('should preserve timestamp format', async () => {
      const chatId = 5555
      await sessionController.addMemory(chatId, 'Test')

      const timestamp = sessionController.session.memories[0].timestamp
      expect(new Date(timestamp).toISOString()).toBe(timestamp)
    })

    it('should work with string chatId', async () => {
      const chatId = 'string-id'
      await sessionController.addMemory(chatId, 'Test')

      expect(mockStorage.put).toHaveBeenCalled()
    })
  })

  describe('getFormattedMemories', () => {
    it('should return empty array when no memories exist', () => {
      sessionController.session.memories = []
      const result = sessionController.getFormattedMemories()
      expect(result).toEqual([])
    })

    it('should return empty array when memories is undefined', () => {
      sessionController.session.memories = undefined as any
      const result = sessionController.getFormattedMemories()
      expect(result).toEqual([])
    })

    it('should format memories correctly', () => {
      sessionController.session.memories = [
        {
          content: 'Memory 1',
          timestamp: '2024-01-01T00:00:00Z'
        },
        {
          content: 'Memory 2',
          timestamp: '2024-01-02T00:00:00Z'
        }
      ]

      const result = sessionController.getFormattedMemories()

      expect(result).toEqual([
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'Memory 1'
            }
          ]
        },
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'Memory 2'
            }
          ]
        }
      ])
    })

    it('should handle empty memories array', () => {
      sessionController.session.memories = []
      const result = sessionController.getFormattedMemories()
      expect(result).toEqual([])
    })
  })
})
