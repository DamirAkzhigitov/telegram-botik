import { describe, it, expect, beforeEach, vi } from 'vitest'
import worker from '../src/index'

// Mock createBot
const mockBot = {
  handleUpdate: vi.fn().mockResolvedValue(undefined)
}

vi.mock('../src/bot/createBot', () => ({
  createBot: vi.fn(() => Promise.resolve(mockBot))
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
})
