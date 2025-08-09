import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMessageHandler } from '../../src/services/MessageHandler'
import { createSessionService } from '../../src/services/SessionService'
import { createGptService } from '../../src/services/GptService'
import { createTelegramService } from '../../src/services/TelegramService'
import { SessionData } from '../../src/types'

// Mocks
const mockSessionService = {
  getSession: vi.fn(),
  updateSession: vi.fn(),
  addMemory: vi.fn()
}

const mockGptService = {
  generateResponse: vi.fn()
}

const mockTelegramService = {
  getPhotoBase64: vi.fn(),
  getStickerByEmoji: vi.fn()
}

// Cast mocks to the correct types
const sessionService = mockSessionService as unknown as ReturnType<
  typeof createSessionService
>
const gptService = mockGptService as unknown as ReturnType<
  typeof createGptService
>
const telegramService = mockTelegramService as unknown as ReturnType<
  typeof createTelegramService
>

describe('MessageHandler', () => {
  const messageHandler = createMessageHandler(
    sessionService,
    gptService,
    telegramService
  )

  const baseMessageContext = {
    chatId: 123,
    from: { is_bot: false, first_name: 'Test' },
    message_id: 456
  }

  const defaultSession: SessionData = {
    userMessages: [],
    stickersPacks: ['test_pack'],
    prompt: 'default prompt',
    firstTime: false,
    promptNotSet: false,
    stickerNotSet: false,
    replyChance: '1',
    memories: []
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default session for most tests
    mockSessionService.getSession.mockResolvedValue(defaultSession)
    mockSessionService.updateSession.mockImplementation((_, data) =>
      Promise.resolve({ ...defaultSession, ...data })
    )
    mockSessionService.addMemory.mockImplementation((_, __) =>
      Promise.resolve(defaultSession)
    )
    mockGptService.generateResponse.mockResolvedValue([
      { type: 'text', content: 'AI response' }
    ])
  })

  it('should handle a first-time user', async () => {
    const firstTimeSession = { ...defaultSession, firstTime: true }
    mockSessionService.getSession.mockResolvedValue(firstTimeSession)

    const actions = await messageHandler.handle(baseMessageContext)

    expect(mockSessionService.updateSession).toHaveBeenCalledWith(
      baseMessageContext.chatId,
      { firstTime: false }
    )
    expect(actions).toContainEqual({
      type: 'sendMessage',
      text: expect.any(String)
    })
  })

  it('should handle a text message and generate a response', async () => {
    const actions = await messageHandler.handle({
      ...baseMessageContext,
      text: 'hello bot'
    })

    expect(mockGptService.generateResponse).toHaveBeenCalled()
    expect(actions).toContainEqual({
      type: 'sendMessage',
      text: 'AI response'
    })
  })

  it('should handle a photo message', async () => {
    mockTelegramService.getPhotoBase64.mockResolvedValue('base64_string')
    await messageHandler.handle({
      ...baseMessageContext,
      photo: []
    })
    expect(mockTelegramService.getPhotoBase64).toHaveBeenCalled()
    expect(mockGptService.generateResponse).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      'base64_string', // image
      expect.any(String)
    )
  })

  it('should save memories from GPT response', async () => {
    mockGptService.generateResponse.mockResolvedValue([
      { type: 'memory', content: 'remember this' },
      { type: 'text', content: 'AI response' }
    ])

    await messageHandler.handle(baseMessageContext)

    expect(mockSessionService.addMemory).toHaveBeenCalledWith(
      baseMessageContext.chatId,
      'remember this'
    )
  })
})
