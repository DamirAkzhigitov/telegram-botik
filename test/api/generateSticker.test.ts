import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../src/api/auth', () => ({
  authenticateRequest: vi.fn()
}))

import { authenticateRequest } from '../../src/api/auth'
import { generateSticker } from '../../src/api/generateSticker'

const mockAuth = vi.mocked(authenticateRequest)

function baseEnv(over?: Partial<Env>): Env {
  return {
    BOT_TOKEN: 'test-token',
    API_KEY: 'xai-key',
    CHAT_SESSIONS_STORAGE: {} as any,
    ...over
  } as Env
}

function authOk() {
  return {
    userId: 1,
    adminAuthService: {} as any
  }
}

describe('generateSticker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 405 for non-POST', async () => {
    const req = new Request('http://localhost/api', { method: 'GET' })
    const res = await generateSticker(req, baseEnv())
    expect(res.status).toBe(405)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValueOnce(null)
    const req = new Request('http://localhost/api', { method: 'POST' })
    const res = await generateSticker(req, baseEnv())
    expect(res.status).toBe(401)
  })

  it('returns 503 when no xAI API key', async () => {
    mockAuth.mockResolvedValueOnce(authOk())
    const req = new Request('http://localhost/api', { method: 'POST' })
    const res = await generateSticker(
      req,
      baseEnv({ API_KEY: undefined, XAI_API_KEY: undefined })
    )
    expect(res.status).toBe(503)
  })

  it('returns 400 when actorImage is missing', async () => {
    mockAuth.mockResolvedValueOnce(authOk())
    const fd = new FormData()
    const req = new Request('http://localhost/api', { method: 'POST', body: fd })
    const res = await generateSticker(req, baseEnv())
    expect(res.status).toBe(400)
  })

  it('returns 400 when reference sticker image has invalid extension', async () => {
    mockAuth.mockResolvedValueOnce(authOk())
    const fd = new FormData()
    fd.append('actorImage', new File(['a'], 'a.png', { type: 'image/png' }))
    fd.append('stickerImage', new File(['b'], 'bad.txt', { type: 'text/plain' }))
    const req = new Request('http://localhost/api', { method: 'POST', body: fd })
    const res = await generateSticker(req, baseEnv())
    expect(res.status).toBe(400)
  })

  it('returns 400 when neither stickerFileId nor stickerImage is provided', async () => {
    mockAuth.mockResolvedValueOnce(authOk())
    const fd = new FormData()
    fd.append('actorImage', new File(['a'], 'a.png', { type: 'image/png' }))
    const req = new Request('http://localhost/api', { method: 'POST', body: fd })
    const res = await generateSticker(req, baseEnv())
    expect(res.status).toBe(400)
    const j = (await res.json()) as { error: string }
    expect(j.error).toContain('Provide either')
  })
})
