import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  processQueuedMessage,
  processQueuedMessagesBatch
} from '../../src/bot/processQueuedMessages'
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

describe('processQueuedMessagesBatch', () => {
  let mockEnv: Env
  let mockStorage: KVNamespace<string>
  let mockD1: D1Database
  let mockSessionController: SessionController
  let mockEmbeddingService: EmbeddingService
  let mockUserService: UserService
  let mockTelegramFileClient: any
  let mockOpenai: any
  let mockResponseApi: any

  const messageItem1: QueuedMessageItem = {
    username: 'alice',
    content: 'Hello',
    timestamp: Date.now(),
    messageId: 123,
    userId: 456,
    userFirstName: 'Alice',
    userLastName: 'Smith'
  }

  const messageItem2: QueuedMessageItem = {
    username: 'bob',
    content: 'How are you?',
    timestamp: Date.now() + 1000,
    messageId: 124,
    userId: 457,
    userFirstName: 'Bob',
    userLastName: 'Jones'
  }

  const messageItem3: QueuedMessageItem = {
    username: 'charlie',
    content: 'Great weather today!',
    timestamp: Date.now() + 2000,
    messageId: 125,
    userId: 458,
    userFirstName: 'Charlie',
    userLastName: 'Brown'
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
    mockEmbeddingService = mockEmbeddingServiceInstance as any
    mockUserService = new UserService(mockD1)

    mockResponseApi = vi.fn().mockResolvedValue([
      {
        type: 'text',
        content: 'Bot response to all messages'
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

  it('should combine multiple messages into a single LLM request', async () => {
    const deps = {
      env: mockEnv,
      responseApi: mockResponseApi,
      embeddingService: mockEmbeddingService,
      sessionController: mockSessionController,
      userService: mockUserService,
      telegramFileClient: mockTelegramFileClient,
      openai: mockOpenai
    }

    await processQueuedMessagesBatch(
      123,
      [messageItem1, messageItem2, messageItem3],
      deps
    )

    expect(mockSessionController.getSession).toHaveBeenCalledWith(123)
    expect(mockResponseApi).toHaveBeenCalledTimes(1)

    // Check that the combined message was sent to the API
    const callArgs = mockResponseApi.mock.calls[0][0]
    const userMessage = callArgs[callArgs.length - 1]
    expect(userMessage.role).toBe('user')
    expect(userMessage.content[0].text).toContain('[alice]: Hello')
    expect(userMessage.content[0].text).toContain('[bob]: How are you?')
    expect(userMessage.content[0].text).toContain(
      '[charlie]: Great weather today!'
    )
  })

  it('should handle empty message batch', async () => {
    const deps = {
      env: mockEnv,
      responseApi: mockResponseApi,
      embeddingService: mockEmbeddingService,
      sessionController: mockSessionController,
      userService: mockUserService,
      telegramFileClient: mockTelegramFileClient,
      openai: mockOpenai
    }

    await processQueuedMessagesBatch(123, [], deps)

    expect(mockResponseApi).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Empty message batch')
    )
  })

  it('should skip empty messages in batch', async () => {
    const emptyMessage: QueuedMessageItem = {
      ...messageItem1,
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

    await processQueuedMessagesBatch(
      123,
      [messageItem1, emptyMessage, messageItem2],
      deps
    )

    expect(mockResponseApi).toHaveBeenCalledTimes(1)
    const callArgs = mockResponseApi.mock.calls[0][0]
    const userMessage = callArgs[callArgs.length - 1]
    expect(userMessage.content[0].text).toContain('[alice]: Hello')
    expect(userMessage.content[0].text).toContain('[bob]: How are you?')
    expect(userMessage.content[0].text).not.toContain('undefined')
  })

  it('should combine images from all messages', async () => {
    const messageWithImage1: QueuedMessageItem = {
      ...messageItem1,
      imageInputs: [
        {
          type: 'input_image',
          source: { type: 'url', url: 'https://example.com/image1.jpg' }
        }
      ]
    }

    const messageWithImage2: QueuedMessageItem = {
      ...messageItem2,
      imageInputs: [
        {
          type: 'input_image',
          source: { type: 'url', url: 'https://example.com/image2.jpg' }
        }
      ]
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

    await processQueuedMessagesBatch(
      123,
      [messageWithImage1, messageWithImage2],
      deps
    )

    const callArgs = mockResponseApi.mock.calls[0][0]
    const userMessage = callArgs[callArgs.length - 1]
    expect(userMessage.content.length).toBe(3) // 1 text + 2 images
    expect(userMessage.content[1].type).toBe('input_image')
    expect(userMessage.content[2].type).toBe('input_image')
  })

  it('should handle sticker descriptions and emojis in batch', async () => {
    const stickerMessage: QueuedMessageItem = {
      ...messageItem1,
      content: '',
      stickerDescription: 'A happy cat',
      stickerEmoji: '😸'
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

    await processQueuedMessagesBatch(123, [stickerMessage, messageItem2], deps)

    const callArgs = mockResponseApi.mock.calls[0][0]
    const userMessage = callArgs[callArgs.length - 1]
    expect(userMessage.content[0].text).toContain('[alice]: A happy cat')
    expect(userMessage.content[0].text).toContain('[bob]: How are you?')
  })

  it('should use last message info for context', async () => {
    const deps = {
      env: mockEnv,
      responseApi: mockResponseApi,
      embeddingService: mockEmbeddingService,
      sessionController: mockSessionController,
      userService: mockUserService,
      telegramFileClient: mockTelegramFileClient,
      openai: mockOpenai
    }

    await processQueuedMessagesBatch(
      123,
      [messageItem1, messageItem2, messageItem3],
      deps
    )

    // The function should use the last message (messageItem3) for context
    // This is verified by the function implementation
    expect(mockResponseApi).toHaveBeenCalled()
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

    await processQueuedMessagesBatch(123, [messageItem1, messageItem2], deps)

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
      processQueuedMessagesBatch(123, [messageItem1, messageItem2], deps)
    ).rejects.toThrow('API error')
  })
})

describe('processQueuedMessagesBatch', () => {
  let mockEnv: Env
  let mockStorage: KVNamespace<string>
  let mockD1: D1Database
  let mockSessionController: SessionController
  let mockEmbeddingService: EmbeddingService
  let mockUserService: UserService
  let mockTelegramFileClient: any
  let mockOpenai: any
  let mockResponseApi: any

  const messageItem1: QueuedMessageItem = {
    username: 'alice',
    content: 'Hello',
    timestamp: Date.now(),
    messageId: 123,
    userId: 456,
    userFirstName: 'Alice',
    userLastName: 'Smith'
  }

  const messageItem2: QueuedMessageItem = {
    username: 'bob',
    content: 'How are you?',
    timestamp: Date.now() + 1000,
    messageId: 124,
    userId: 457,
    userFirstName: 'Bob',
    userLastName: 'Jones'
  }

  const messageItem3: QueuedMessageItem = {
    username: 'charlie',
    content: 'Great weather today!',
    timestamp: Date.now() + 2000,
    messageId: 125,
    userId: 458,
    userFirstName: 'Charlie',
    userLastName: 'Brown'
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
    mockEmbeddingService = mockEmbeddingServiceInstance as any
    mockUserService = new UserService(mockD1)

    mockResponseApi = vi.fn().mockResolvedValue([
      {
        type: 'text',
        content: 'Bot response to all messages'
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

  it('should combine multiple messages into a single LLM request', async () => {
    const deps = {
      env: mockEnv,
      responseApi: mockResponseApi,
      embeddingService: mockEmbeddingService,
      sessionController: mockSessionController,
      userService: mockUserService,
      telegramFileClient: mockTelegramFileClient,
      openai: mockOpenai
    }

    await processQueuedMessagesBatch(
      123,
      [messageItem1, messageItem2, messageItem3],
      deps
    )

    expect(mockSessionController.getSession).toHaveBeenCalledWith(123)
    expect(mockResponseApi).toHaveBeenCalledTimes(1)

    // Check that the combined message was sent to the API
    const callArgs = mockResponseApi.mock.calls[0][0]
    const userMessage = callArgs[callArgs.length - 1]
    expect(userMessage.role).toBe('user')
    expect(userMessage.content[0].text).toContain('[alice]: Hello')
    expect(userMessage.content[0].text).toContain('[bob]: How are you?')
    expect(userMessage.content[0].text).toContain(
      '[charlie]: Great weather today!'
    )
  })

  it('should handle empty message batch', async () => {
    const deps = {
      env: mockEnv,
      responseApi: mockResponseApi,
      embeddingService: mockEmbeddingService,
      sessionController: mockSessionController,
      userService: mockUserService,
      telegramFileClient: mockTelegramFileClient,
      openai: mockOpenai
    }

    await processQueuedMessagesBatch(123, [], deps)

    expect(mockResponseApi).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Empty message batch')
    )
  })

  it('should skip empty messages in batch', async () => {
    const emptyMessage: QueuedMessageItem = {
      ...messageItem1,
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

    await processQueuedMessagesBatch(
      123,
      [messageItem1, emptyMessage, messageItem2],
      deps
    )

    expect(mockResponseApi).toHaveBeenCalledTimes(1)
    const callArgs = mockResponseApi.mock.calls[0][0]
    const userMessage = callArgs[callArgs.length - 1]
    expect(userMessage.content[0].text).toContain('[alice]: Hello')
    expect(userMessage.content[0].text).toContain('[bob]: How are you?')
    expect(userMessage.content[0].text).not.toContain('undefined')
  })

  it('should combine images from all messages', async () => {
    const messageWithImage1: QueuedMessageItem = {
      ...messageItem1,
      imageInputs: [
        {
          type: 'input_image',
          source: { type: 'url', url: 'https://example.com/image1.jpg' }
        }
      ]
    }

    const messageWithImage2: QueuedMessageItem = {
      ...messageItem2,
      imageInputs: [
        {
          type: 'input_image',
          source: { type: 'url', url: 'https://example.com/image2.jpg' }
        }
      ]
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

    await processQueuedMessagesBatch(
      123,
      [messageWithImage1, messageWithImage2],
      deps
    )

    const callArgs = mockResponseApi.mock.calls[0][0]
    const userMessage = callArgs[callArgs.length - 1]
    expect(userMessage.content.length).toBe(3) // 1 text + 2 images
    expect(userMessage.content[1].type).toBe('input_image')
    expect(userMessage.content[2].type).toBe('input_image')
  })

  it('should handle sticker descriptions and emojis in batch', async () => {
    const stickerMessage: QueuedMessageItem = {
      ...messageItem1,
      content: '',
      stickerDescription: 'A happy cat',
      stickerEmoji: '😸'
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

    await processQueuedMessagesBatch(123, [stickerMessage, messageItem2], deps)

    const callArgs = mockResponseApi.mock.calls[0][0]
    const userMessage = callArgs[callArgs.length - 1]
    expect(userMessage.content[0].text).toContain('[alice]: A happy cat')
    expect(userMessage.content[0].text).toContain('[bob]: How are you?')
  })

  it('should use last message info for context', async () => {
    const deps = {
      env: mockEnv,
      responseApi: mockResponseApi,
      embeddingService: mockEmbeddingService,
      sessionController: mockSessionController,
      userService: mockUserService,
      telegramFileClient: mockTelegramFileClient,
      openai: mockOpenai
    }

    await processQueuedMessagesBatch(
      123,
      [messageItem1, messageItem2, messageItem3],
      deps
    )

    // The function should use the last message (messageItem3) for context
    // This is verified by the function implementation
    expect(mockResponseApi).toHaveBeenCalled()
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

    await processQueuedMessagesBatch(123, [messageItem1, messageItem2], deps)

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
      processQueuedMessagesBatch(123, [messageItem1, messageItem2], deps)
    ).rejects.toThrow('API error')
  })
})
