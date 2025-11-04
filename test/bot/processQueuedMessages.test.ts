import { describe, it, expect, beforeEach, vi } from 'vitest'
import { processQueuedMessage } from '../../src/bot/processQueuedMessages'
import type { QueuedMessageItem } from '../../src/types'
import { SessionController } from '../../src/service/SessionController'
import { EmbeddingService } from '../../src/service/EmbeddingService'
import { UserService } from '../../src/service/UserService'
import { getOpenAIClient } from '../../src/gpt'

vi.mock('../../src/gpt')
vi.mock('telegraf', () => {
  const sendChatAction = vi.fn().mockResolvedValue(undefined)
  const setMessageReaction = vi.fn().mockResolvedValue(undefined)
  const sendMessage = vi.fn().mockResolvedValue(undefined)
  return {
    Telegraf: vi.fn().mockImplementation(() => ({
      telegram: {
        sendChatAction,
        setMessageReaction,
        sendMessage
      }
    }))
  }
})
const mockEmbeddingServiceInstance = {
  saveMessage: vi.fn(),
  saveSummary: vi.fn(),
  fetchRelevantMessages: vi.fn(),
  fetchRelevantSummaries: vi.fn().mockResolvedValue([])
}

vi.mock('../../src/service/EmbeddingService', () => ({
  EmbeddingService: vi.fn().mockImplementation(() => mockEmbeddingServiceInstance)
}))

describe('processQueuedMessage', () => {
  let mockEnv: Env
  let mockStorage: KVNamespace<string>
  let mockD1: D1Database
  let mockSessionController: SessionController
  let mockEmbeddingService: EmbeddingService
  let mockUserService: UserService
  let mockTelegramFileClient: any
  let mockOpenai: any
  let mockResponseApi: any

  const messageItem: QueuedMessageItem = {
    username: 'testuser',
    content: 'test message',
    timestamp: Date.now(),
    messageId: 123,
    userId: 456,
    userFirstName: 'Test',
    userLastName: 'User'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    mockStorage = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn()
    } as any

    mockD1 = {
      prepare: vi.fn(),
      exec: vi.fn(),
      batch: vi.fn()
    } as any

    mockEnv = {
      CHAT_SESSIONS_STORAGE: mockStorage,
      DB: mockD1,
      BOT_TOKEN: 'test-token',
      API_KEY: 'test-api-key'
    } as Env

    mockSessionController = new SessionController(mockEnv)
    // Use mocked EmbeddingService instance
    mockEmbeddingService = mockEmbeddingServiceInstance as any
    mockUserService = new UserService(mockD1)

    mockResponseApi = vi.fn().mockResolvedValue([
      {
        type: 'text',
        content: 'Bot response'
      }
    ])

    mockOpenai = {
      responses: {
        create: vi.fn()
      }
    }

    vi.mocked(getOpenAIClient).mockReturnValue({
      responseApi: mockResponseApi,
      openai: mockOpenai
    })

    mockTelegramFileClient = {
      get: vi.fn()
    }

    // Mock session data
    vi.spyOn(mockSessionController, 'getSession').mockResolvedValue({
      userMessages: [],
      stickersPacks: ['test'],
      prompt: '',
      firstTime: false,
      promptNotSet: false,
      stickerNotSet: false,
      toggle_history: true,
      model: 'gpt-4o-mini',
      chat_settings: {
        send_message_option: {}
      },
      memories: []
    } as any)

    vi.spyOn(mockUserService, 'hasEnoughCoins').mockResolvedValue(true)
    vi.spyOn(mockSessionController, 'getFormattedMemories').mockReturnValue([])
    vi.spyOn(mockSessionController, 'updateSession').mockResolvedValue(undefined)
    vi.spyOn(mockSessionController, 'addMemory').mockResolvedValue(undefined)
    vi.spyOn(mockEmbeddingService, 'fetchRelevantSummaries').mockResolvedValue([])
  })

  it('should process message successfully', async () => {
    const deps = {
      env: mockEnv,
      responseApi: mockResponseApi,
      embeddingService: mockEmbeddingService,
      sessionController: mockSessionController,
      userService: mockUserService,
      telegramFileClient: mockTelegramFileClient,
      openai: mockOpenai,
      ctx: {}
    }

    await processQueuedMessage(123, messageItem, deps)

    expect(mockSessionController.getSession).toHaveBeenCalledWith(123)
    expect(mockResponseApi).toHaveBeenCalled()
    expect(mockSessionController.updateSession).toHaveBeenCalled()
  })

  it('should skip empty messages', async () => {
    const emptyMessage: QueuedMessageItem = {
      ...messageItem,
      content: '',
      stickerDescription: null,
      stickerEmoji: null,
      caption: undefined
    }

    const deps = {
      env: mockEnv,
      responseApi: mockResponseApi,
      embeddingService: mockEmbeddingService,
      sessionController: mockSessionController,
      userService: mockUserService,
      telegramFileClient: mockTelegramFileClient,
      openai: mockOpenai
    }

    await processQueuedMessage(123, emptyMessage, deps)

    expect(mockResponseApi).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Empty message')
    )
  })

  it('should use sticker description when available', async () => {
    const stickerMessage: QueuedMessageItem = {
      ...messageItem,
      content: '',
      stickerDescription: 'A cute cat sticker'
    }

    const deps = {
      env: mockEnv,
      responseApi: mockResponseApi,
      embeddingService: mockEmbeddingService,
      sessionController: mockSessionController,
      userService: mockUserService,
      telegramFileClient: mockTelegramFileClient,
      openai: mockOpenai
    }

    await processQueuedMessage(123, stickerMessage, deps)

    expect(mockResponseApi).toHaveBeenCalled()
    const callArgs = mockResponseApi.mock.calls[0][0]
    expect(callArgs[callArgs.length - 1].content[0].text).toContain(
      'A cute cat sticker'
    )
  })

  it('should handle when botMessages is null', async () => {
    mockResponseApi.mockResolvedValue(null)

    const deps = {
      env: mockEnv,
      responseApi: mockResponseApi,
      embeddingService: mockEmbeddingService,
      sessionController: mockSessionController,
      userService: mockUserService,
      telegramFileClient: mockTelegramFileClient,
      openai: mockOpenai
    }

    await processQueuedMessage(123, messageItem, deps)

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('No bot messages returned')
    )
    expect(mockSessionController.updateSession).not.toHaveBeenCalled()
  })

  it('should handle errors gracefully', async () => {
    mockResponseApi.mockRejectedValue(new Error('API error'))

    const deps = {
      env: mockEnv,
      responseApi: mockResponseApi,
      embeddingService: mockEmbeddingService,
      sessionController: mockSessionController,
      userService: mockUserService,
      telegramFileClient: mockTelegramFileClient,
      openai: mockOpenai
    }

    await expect(
      processQueuedMessage(123, messageItem, deps)
    ).rejects.toThrow('API error')
  })
})
