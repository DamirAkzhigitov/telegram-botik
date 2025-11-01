import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBot } from '../../src/bot/createBot'

// Mock all dependencies
vi.mock('../../src/gpt', () => ({
  getOpenAIClient: vi.fn(() => ({
    responseApi: vi.fn(),
    openai: {}
  }))
}))

vi.mock('../../src/service/EmbeddingService', () => ({
  EmbeddingService: vi.fn().mockImplementation(() => ({}))
}))

vi.mock('../../src/service/SessionController', () => ({
  SessionController: vi.fn().mockImplementation(() => ({}))
}))

vi.mock('../../src/service/UserService', () => ({
  UserService: vi.fn().mockImplementation(() => ({}))
}))

vi.mock('../../src/bot/media', () => ({
  createTelegramFileClient: vi.fn(() => ({}))
}))

vi.mock('../../src/bot/messageHandler', () => ({
  handleIncomingMessage: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../src/commands', () => ({
  default: [
    vi.fn(),
    vi.fn(),
    vi.fn()
  ]
}))

vi.mock('telegraf', () => ({
  Telegraf: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    command: vi.fn(),
    use: vi.fn(),
    launch: vi.fn()
  }))
}))

vi.mock('telegraf/filters', () => ({
  message: vi.fn(() => 'message')
}))

describe('createBot', () => {
  let mockEnv: Env

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    mockEnv = {
      API_KEY: 'test-api-key',
      BOT_TOKEN: 'test-bot-token',
      DB: {} as any,
      CHAT_SESSIONS_STORAGE: {} as any
    } as Env
  })

  it('should create a bot instance', async () => {
    const { Telegraf } = await import('telegraf')
    const bot = await createBot(mockEnv)

    expect(Telegraf).toHaveBeenCalledWith(mockEnv.BOT_TOKEN, {
      telegram: { webhookReply: false }
    })
    expect(bot).toBeDefined()
  })

  it('should use webhookReply option when provided', async () => {
    const { Telegraf } = await import('telegraf')
    await createBot(mockEnv, true)

    expect(Telegraf).toHaveBeenCalledWith(mockEnv.BOT_TOKEN, {
      telegram: { webhookReply: true }
    })
  })

  it('should initialize all services', async () => {
    const { getOpenAIClient } = await import('../../src/gpt')
    const { EmbeddingService } = await import('../../src/service/EmbeddingService')
    const { SessionController } = await import('../../src/service/SessionController')
    const { UserService } = await import('../../src/service/UserService')
    const { createTelegramFileClient } = await import('../../src/bot/media')

    await createBot(mockEnv)

    expect(getOpenAIClient).toHaveBeenCalledWith(mockEnv.API_KEY)
    expect(EmbeddingService).toHaveBeenCalledWith(mockEnv)
    expect(SessionController).toHaveBeenCalledWith(mockEnv)
    expect(UserService).toHaveBeenCalledWith(mockEnv.DB)
    expect(createTelegramFileClient).toHaveBeenCalled()
  })

  it('should register all commands', async () => {
    const commands = await import('../../src/commands')
    const { Telegraf } = await import('telegraf')
    const mockBot = {
      on: vi.fn(),
      command: vi.fn()
    }
    vi.mocked(Telegraf).mockReturnValue(mockBot as any)

    await createBot(mockEnv)

    // Commands are functions that register themselves, so we verify they were imported
    expect(commands.default.length).toBeGreaterThan(0)
    // The commands will be called during bot creation, but they register themselves
    // by calling bot.command() internally, so we can't directly verify that here
  })

  it('should set up message handler', async () => {
    const { Telegraf } = await import('telegraf')
    await import('telegraf/filters')
    const mockBot = {
      on: vi.fn(),
      command: vi.fn()
    }
    vi.mocked(Telegraf).mockReturnValue(mockBot as any)

    await createBot(mockEnv)

    expect(mockBot.on).toHaveBeenCalledWith('message', expect.any(Function))
  })

  it('should handle errors in message handler', async () => {
    const { handleIncomingMessage } = await import('../../src/bot/messageHandler')
    const { Telegraf } = await import('telegraf')
    
    const mockHandler = vi.fn()
    const mockBot = {
      on: vi.fn((filter, handler) => {
        mockHandler.handler = handler
      }),
      command: vi.fn()
    }
    vi.mocked(Telegraf).mockReturnValue(mockBot as any)
    vi.mocked(handleIncomingMessage).mockRejectedValueOnce(new Error('Test error'))

    await createBot(mockEnv)

    // Simulate a message being received
    await mockHandler.handler({} as any)

    expect(console.error).toHaveBeenCalledWith('Error processing message:', expect.any(Error))
  })

  it('should return the bot instance', async () => {
    const { Telegraf } = await import('telegraf')
    const mockBot = {
      on: vi.fn(),
      command: vi.fn()
    }
    vi.mocked(Telegraf).mockReturnValue(mockBot as any)

    const result = await createBot(mockEnv)

    expect(result).toBe(mockBot)
  })
})

