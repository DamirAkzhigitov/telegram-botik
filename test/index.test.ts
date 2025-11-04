import { describe, it, expect, beforeEach, vi } from 'vitest'
import worker from '../src/index'

// Mock createBot
const mockBot = {
  handleUpdate: vi.fn().mockResolvedValue(undefined)
}

vi.mock('../src/bot/createBot', () => ({
  createBot: vi.fn(() => mockBot)
}))

// Mock API endpoints
const mockGetSessions = vi.fn()
const mockGetSession = vi.fn()
const mockGetAdminChats = vi.fn()

vi.mock('../src/api/sessions', () => ({
  getSessions: (...args: any[]) => mockGetSessions(...args),
  getSession: (...args: any[]) => mockGetSession(...args),
  getAdminChats: (...args: any[]) => mockGetAdminChats(...args)
}))

// Mock processQueuedMessage and dependencies
vi.mock('../src/bot/processQueuedMessages', () => ({
  processQueuedMessage: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../src/gpt', () => ({
  getOpenAIClient: vi.fn().mockReturnValue({
    responseApi: vi.fn(),
    openai: {}
  })
}))
vi.mock('../src/service/EmbeddingService', () => ({
  EmbeddingService: vi.fn()
}))
vi.mock('../src/service/SessionController', () => ({
  SessionController: vi.fn()
}))
vi.mock('../src/service/UserService', () => ({
  UserService: vi.fn()
}))
vi.mock('../src/bot/media', () => ({
  createTelegramFileClient: vi.fn().mockReturnValue({})
}))

describe('Worker Entry Point', () => {
  let mockEnv: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockEnv = {
      API_KEY: 'test-api-key',
      BOT_TOKEN: 'test-bot-token',
      DB: {} as any,
      CHAT_SESSIONS_STORAGE: {} as any
    } as Env

    // Reset mock implementations
    mockGetSessions.mockResolvedValue(new Response('OK', { status: 200 }))
    mockGetSession.mockResolvedValue(new Response('OK', { status: 200 }))
    mockGetAdminChats.mockResolvedValue(new Response('OK', { status: 200 }))
  })

  it('should handle POST request with valid update', async () => {
    const update = {
      update_id: 123,
      message: {
        message_id: 1,
        from: { id: 123, is_bot: false },
        chat: { id: 456 },
        text: 'Hello'
      }
    }

    const request = new Request('https://example.com/webhook', {
      method: 'POST',
      body: JSON.stringify(update),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await worker.fetch(request, mockEnv)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('OK')
    expect(mockBot.handleUpdate).toHaveBeenCalledWith(update)
  })

  it('should return 400 for invalid JSON in POST request', async () => {
    const request = new Request('https://example.com/webhook', {
      method: 'POST',
      body: 'invalid json',
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await worker.fetch(request, mockEnv)

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('Invalid request')
  })

  it('should return 405 for non-POST requests', async () => {
    const request = new Request('https://example.com/webhook', {
      method: 'GET'
    })

    const response = await worker.fetch(request, mockEnv)

    expect(response.status).toBe(405)
    expect(await response.text()).toBe('Method Not Allowed')
  })

  it('should return 405 for PUT requests', async () => {
    const request = new Request('https://example.com/webhook', {
      method: 'PUT'
    })

    const response = await worker.fetch(request, mockEnv)

    expect(response.status).toBe(405)
  })

  it('should return 400 when bot.handleUpdate throws an error', async () => {
    const update = {
      update_id: 123,
      message: {
        message_id: 1,
        from: { id: 123, is_bot: false },
        chat: { id: 456 },
        text: 'Hello'
      }
    }

    mockBot.handleUpdate.mockRejectedValueOnce(new Error('Bot error'))

    const request = new Request('https://example.com/webhook', {
      method: 'POST',
      body: JSON.stringify(update),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await worker.fetch(request, mockEnv)

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('Invalid request')
  })

  describe('GET requests', () => {
    it('should serve admin panel at /admin', async () => {
      const request = new Request('https://example.com/admin', {
        method: 'GET'
      })

      const response = await worker.fetch(request, mockEnv)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('text/html')
      const html = await response.text()
      expect(html).toContain('Admin Panel')
      expect(html).toContain('telegram-web-app.js')
    })

    it('should serve admin panel at /admin/', async () => {
      const request = new Request('https://example.com/admin/', {
        method: 'GET'
      })

      const response = await worker.fetch(request, mockEnv)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('text/html')
    })

    it('should return health check at /', async () => {
      const request = new Request('https://example.com/', {
        method: 'GET'
      })

      const response = await worker.fetch(request, mockEnv)

      expect(response.status).toBe(200)
      expect(await response.text()).toBe('OK')
    })

    it('should return health check at /health', async () => {
      const request = new Request('https://example.com/health', {
        method: 'GET'
      })

      const response = await worker.fetch(request, mockEnv)

      expect(response.status).toBe(200)
      expect(await response.text()).toBe('OK')
    })

    it('should handle /api/sessions endpoint', async () => {
      mockGetSessions.mockResolvedValueOnce(
        new Response(JSON.stringify({ sessions: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )

      const request = new Request('https://example.com/api/sessions', {
        method: 'GET'
      })

      const response = await worker.fetch(request, mockEnv)

      expect(mockGetSessions).toHaveBeenCalledWith(request, mockEnv)
      expect(response.status).toBe(200)
    })

    it('should handle /api/sessions/:chatId endpoint', async () => {
      mockGetSession.mockResolvedValueOnce(
        new Response(JSON.stringify({ chatId: '123', session: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )

      const request = new Request('https://example.com/api/sessions/123', {
        method: 'GET'
      })

      const response = await worker.fetch(request, mockEnv)

      expect(mockGetSession).toHaveBeenCalledWith(request, mockEnv, '123')
      expect(response.status).toBe(200)
    })

    it('should handle /api/admin/chats endpoint', async () => {
      mockGetAdminChats.mockResolvedValueOnce(
        new Response(JSON.stringify({ chats: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )

      const request = new Request('https://example.com/api/admin/chats', {
        method: 'GET'
      })

      const response = await worker.fetch(request, mockEnv)

      expect(mockGetAdminChats).toHaveBeenCalledWith(request, mockEnv)
      expect(response.status).toBe(200)
    })

    it('should return 404 for unknown API endpoints', async () => {
      const request = new Request('https://example.com/api/unknown', {
        method: 'GET'
      })

      const response = await worker.fetch(request, mockEnv)

      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toBe('Not Found')
    })

    it('should return 404 for unknown routes', async () => {
      const request = new Request('https://example.com/unknown', {
        method: 'GET'
      })

      const response = await worker.fetch(request, mockEnv)

      expect(response.status).toBe(404)
      expect(await response.text()).toBe('Not Found')
    })

    it('should return 405 for GET requests to /webhook', async () => {
      const request = new Request('https://example.com/webhook', {
        method: 'GET'
      })

      const response = await worker.fetch(request, mockEnv)

      expect(response.status).toBe(405)
      expect(await response.text()).toBe('Method Not Allowed')
    })

    it('should return 405 for GET requests to /webhook/*', async () => {
      const request = new Request('https://example.com/webhook/test', {
        method: 'GET'
      })

      const response = await worker.fetch(request, mockEnv)

      expect(response.status).toBe(405)
      expect(await response.text()).toBe('Method Not Allowed')
    })

    it('should return 405 for non-POST/POST-GET requests to webhook paths', async () => {
      const request = new Request('https://example.com/webhook', {
        method: 'PUT'
      })

      const response = await worker.fetch(request, mockEnv)

      expect(response.status).toBe(405)
    })
  })

  describe('Queue handler', () => {
    let mockProcessQueuedMessage: ReturnType<typeof vi.fn>

    beforeEach(async () => {
      vi.clearAllMocks()
      const { processQueuedMessage } = await import('../src/bot/processQueuedMessages')
      mockProcessQueuedMessage = vi.mocked(processQueuedMessage)
      mockProcessQueuedMessage.mockResolvedValue(undefined)

      mockEnv = {
        ...mockEnv,
        MESSAGE_QUEUE: {
          send: vi.fn()
        } as any,
        CHAT_SESSIONS_STORAGE: {
          get: vi.fn(),
          put: vi.fn(),
          delete: vi.fn()
        } as any
      }
    })

    it('should process queue messages', async () => {
      const mockStorage = mockEnv.CHAT_SESSIONS_STORAGE as any
      vi.mocked(mockStorage.get).mockResolvedValue(null) // No lock
      vi.mocked(mockStorage.put).mockResolvedValue(undefined)
      vi.mocked(mockStorage.delete).mockResolvedValue(undefined)

      const batch = {
        messages: [
          {
            id: 'msg1',
            timestamp: new Date(),
            body: {
              chatId: 123,
              messages: [
                {
                  username: 'user1',
                  content: 'message 1',
                  timestamp: Date.now(),
                  messageId: 1,
                  userId: 1
                }
              ]
            },
            retry: vi.fn(),
            ack: vi.fn()
          }
        ],
        queue: 'telegram-messages',
        retryAll: vi.fn(),
        ackAll: vi.fn()
      } as any

      await worker.queue(batch, mockEnv, {} as ExecutionContext)

      expect(mockStorage.get).toHaveBeenCalled()
      expect(mockProcessQueuedMessage).toHaveBeenCalled()
      expect(mockStorage.delete).toHaveBeenCalledWith('processing_123')
    })

    it('should retry messages when chat is locked', async () => {
      const mockStorage = mockEnv.CHAT_SESSIONS_STORAGE as any
      const lockTimestamp = Date.now().toString()
      vi.mocked(mockStorage.get).mockResolvedValue(lockTimestamp)

      const message = {
        id: 'msg1',
        timestamp: new Date(),
        body: {
          chatId: 123,
          messages: [
            {
              username: 'user1',
              content: 'message 1',
              timestamp: Date.now(),
              messageId: 1,
              userId: 1
            }
          ]
        },
        retry: vi.fn(),
        ack: vi.fn()
      }

      const batch = {
        messages: [message],
        queue: 'telegram-messages',
        retryAll: vi.fn(),
        ackAll: vi.fn()
      } as any

      await worker.queue(batch, mockEnv, {} as ExecutionContext)

      expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 2 })
      expect(mockProcessQueuedMessage).not.toHaveBeenCalled()
    })

    it('should clear old locks and process', async () => {
      const mockStorage = mockEnv.CHAT_SESSIONS_STORAGE as any
      const oldLockTimestamp = (Date.now() - 400000).toString() // 6+ minutes ago
      vi.mocked(mockStorage.get)
        .mockResolvedValueOnce(oldLockTimestamp) // Lock check
        .mockResolvedValueOnce(null) // Session check
      vi.mocked(mockStorage.delete).mockResolvedValue(undefined)
      vi.mocked(mockStorage.put).mockResolvedValue(undefined)

      const batch = {
        messages: [
          {
            id: 'msg1',
            timestamp: new Date(),
            body: {
              chatId: 123,
              messages: [
                {
                  username: 'user1',
                  content: 'message 1',
                  timestamp: Date.now(),
                  messageId: 1,
                  userId: 1
                }
              ]
            },
            retry: vi.fn(),
            ack: vi.fn()
          }
        ],
        queue: 'telegram-messages',
        retryAll: vi.fn(),
        ackAll: vi.fn()
      } as any

      await worker.queue(batch, mockEnv, {} as ExecutionContext)

      expect(mockStorage.delete).toHaveBeenCalledWith('processing_123')
      expect(mockProcessQueuedMessage).toHaveBeenCalled()
    })

    it('should handle processing errors and retry', async () => {
      const mockStorage = mockEnv.CHAT_SESSIONS_STORAGE as any
      vi.mocked(mockStorage.get).mockResolvedValue(null)
      vi.mocked(mockStorage.put).mockResolvedValue(undefined)
      vi.mocked(mockStorage.delete).mockResolvedValue(undefined)

      mockProcessQueuedMessage.mockRejectedValueOnce(new Error('Processing error'))

      const message = {
        id: 'msg1',
        timestamp: new Date(),
        body: {
          chatId: 123,
          messages: [
            {
              username: 'user1',
              content: 'message 1',
              timestamp: Date.now(),
              messageId: 1,
              userId: 1
            }
          ]
        },
        retry: vi.fn(),
        ack: vi.fn()
      }

      const batch = {
        messages: [message],
        queue: 'telegram-messages',
        retryAll: vi.fn(),
        ackAll: vi.fn()
      } as any

      await worker.queue(batch, mockEnv, {} as ExecutionContext)

      expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 5 })
      expect(message.ack).not.toHaveBeenCalled()
      expect(mockStorage.delete).toHaveBeenCalledWith('processing_123')
    })
  })
})
