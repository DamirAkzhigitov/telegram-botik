import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockProactiveCronTick, mockGenerateSticker, mockSendStickerToUser } =
  vi.hoisted(() => ({
    mockProactiveCronTick: vi.fn().mockResolvedValue(undefined),
    mockGenerateSticker: vi.fn(),
    mockSendStickerToUser: vi.fn()
  }))

vi.mock('../src/cron/proactiveRevival', () => ({
  runProactiveCronTick: mockProactiveCronTick
}))

vi.mock('../src/api/generateSticker', () => ({
  generateSticker: mockGenerateSticker
}))

vi.mock('../src/api/sendStickerToUser', () => ({
  sendStickerToUser: mockSendStickerToUser
}))

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
const mockPatchSession = vi.fn()

vi.mock('../src/api/sessions', () => ({
  getSessions: (...args: any[]) => mockGetSessions(...args),
  getSession: (...args: any[]) => mockGetSession(...args),
  getAdminChats: (...args: any[]) => mockGetAdminChats(...args),
  patchSession: (...args: any[]) => mockPatchSession(...args)
}))

describe('Worker Entry Point', () => {
  let mockEnv: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockProactiveCronTick.mockResolvedValue(undefined)
    mockGenerateSticker.mockResolvedValue(new Response('{}', { status: 200 }))
    mockSendStickerToUser.mockResolvedValue(new Response('{}', { status: 200 }))
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
    mockPatchSession.mockResolvedValue(new Response('OK', { status: 200 }))
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

    it('should handle PATCH /api/sessions/:chatId', async () => {
      mockPatchSession.mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )

      const request = new Request('https://example.com/api/sessions/123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'x' })
      })

      const response = await worker.fetch(request, mockEnv)

      expect(mockPatchSession).toHaveBeenCalledWith(request, mockEnv, '123')
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

    it('should route /api/sticker-packs to stickers API', async () => {
      const request = new Request('https://example.com/api/sticker-packs', {
        method: 'GET'
      })

      const response = await worker.fetch(request, mockEnv)

      expect([200, 401]).toContain(response.status)
    })

    it('should route /api/stickers to stickers API', async () => {
      const request = new Request(
        'https://example.com/api/stickers?pack=test',
        { method: 'GET' }
      )

      const response = await worker.fetch(request, mockEnv)

      expect([200, 400, 401]).toContain(response.status)
    })

    it('should route /api/sticker-file to stickers API', async () => {
      const request = new Request(
        'https://example.com/api/sticker-file?file_id=abc',
        { method: 'GET' }
      )

      const response = await worker.fetch(request, mockEnv)

      expect([200, 400, 401, 404, 502]).toContain(response.status)
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

    it('should route POST /api/generate-sticker', async () => {
      const request = new Request('https://example.com/api/generate-sticker', {
        method: 'POST'
      })

      const response = await worker.fetch(request, mockEnv)

      expect(mockGenerateSticker).toHaveBeenCalledWith(request, mockEnv)
      expect(response.status).toBe(200)
    })

    it('should route POST /api/send-sticker-to-user', async () => {
      const request = new Request('https://example.com/api/send-sticker-to-user', {
        method: 'POST'
      })

      const response = await worker.fetch(request, mockEnv)

      expect(mockSendStickerToUser).toHaveBeenCalledWith(request, mockEnv)
      expect(response.status).toBe(200)
    })

    it('should return 405 for non-POST/POST-GET requests to webhook paths', async () => {
      const request = new Request('https://example.com/webhook', {
        method: 'PUT'
      })

      const response = await worker.fetch(request, mockEnv)

      expect(response.status).toBe(405)
    })
  })

  describe('scheduled (Stage 3 proactive cron)', () => {
    it('runs runProactiveCronTick with env', async () => {
      const w = worker as {
        scheduled: (
          event: ScheduledEvent,
          env: Env,
          ctx: ExecutionContext
        ) => Promise<void>
      }

      await w.scheduled({} as ScheduledEvent, mockEnv as Env, {} as ExecutionContext)

      expect(mockProactiveCronTick).toHaveBeenCalledTimes(1)
      expect(mockProactiveCronTick).toHaveBeenCalledWith(mockEnv)
    })
  })
})
