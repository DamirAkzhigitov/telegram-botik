import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../src/api/auth', () => ({
  authenticateRequest: vi.fn()
}))

import { authenticateRequest } from '../../src/api/auth'
import { sendStickerToUser } from '../../src/api/sendStickerToUser'

const mockAuth = vi.mocked(authenticateRequest)

function baseEnv(): Env {
  return {
    BOT_TOKEN: 'test-token',
    CHAT_SESSIONS_STORAGE: {} as any
  } as Env
}

describe('sendStickerToUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 405 for non-POST', async () => {
    const req = new Request('http://localhost/api', { method: 'GET' })
    const res = await sendStickerToUser(req, baseEnv())
    expect(res.status).toBe(405)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValueOnce(null)
    const req = new Request('http://localhost/api', { method: 'POST' })
    const res = await sendStickerToUser(req, baseEnv())
    expect(res.status).toBe(401)
  })

  it('returns 400 when image is missing', async () => {
    mockAuth.mockResolvedValueOnce({
      userId: 123,
      adminAuthService: {} as any
    })
    const form = new FormData()
    const req = new Request('http://localhost/api', { method: 'POST', body: form })
    const res = await sendStickerToUser(req, baseEnv())
    expect(res.status).toBe(400)
    const j = (await res.json()) as { error: string }
    expect(j.error).toContain('Missing')
  })

  it('returns 400 when userId is 0 (dev bypass without Telegram user)', async () => {
    mockAuth.mockResolvedValueOnce({
      userId: 0,
      adminAuthService: {} as any
    })
    const form = new FormData()
    form.append('image', new File(['x'], 'sticker.png', { type: 'image/png' }))
    const req = new Request('http://localhost/api', { method: 'POST', body: form })
    const res = await sendStickerToUser(req, baseEnv())
    expect(res.status).toBe(400)
  })

  it('returns 200 when Telegram accepts sendDocument', async () => {
    mockAuth.mockResolvedValueOnce({
      userId: 999,
      adminAuthService: {} as any
    })
    const form = new FormData()
    form.append('image', new File(['x'], 'sticker.png', { type: 'image/png' }))
    const req = new Request('http://localhost/api', { method: 'POST', body: form })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )
    const res = await sendStickerToUser(req, baseEnv())
    fetchSpy.mockRestore()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  it('returns 502 when Telegram returns not ok', async () => {
    mockAuth.mockResolvedValueOnce({
      userId: 999,
      adminAuthService: {} as any
    })
    const form = new FormData()
    form.append('image', new File(['x'], 'sticker.png', { type: 'image/png' }))
    const req = new Request('http://localhost/api', { method: 'POST', body: form })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: 'Bad' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )
    const res = await sendStickerToUser(req, baseEnv())
    fetchSpy.mockRestore()
    expect(res.status).toBe(502)
  })

  it('returns 502 when fetch throws', async () => {
    mockAuth.mockResolvedValueOnce({
      userId: 999,
      adminAuthService: {} as any
    })
    const form = new FormData()
    form.append('image', new File(['x'], 'sticker.png', { type: 'image/png' }))
    const req = new Request('http://localhost/api', { method: 'POST', body: form })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('net'))
    const res = await sendStickerToUser(req, baseEnv())
    fetchSpy.mockRestore()
    expect(res.status).toBe(502)
  })
})
