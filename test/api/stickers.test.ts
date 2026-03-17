import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getStickerPacks,
  getStickers,
  getStickerFile
} from '../../src/api/stickers'
import { authenticateRequest } from '../../src/api/auth'

vi.mock('../../src/api/auth')

describe('API Stickers', () => {
  let mockEnv: Env

  beforeEach(() => {
    vi.clearAllMocks()
    mockEnv = {
      BOT_TOKEN: 'test-bot-token',
      CHAT_SESSIONS_STORAGE: {} as any
    } as Env
  })

  describe('getStickerPacks', () => {
    it('should return 401 when not authenticated', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce(null)
      const request = new Request('https://example.com/api/sticker-packs')

      const response = await getStickerPacks(request, mockEnv)

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error).toBe('Unauthorized')
    })

    it('should return sticker packs when authenticated', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: {}
      })
      const request = new Request('https://example.com/api/sticker-packs')

      const response = await getStickerPacks(request, mockEnv)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.packs).toEqual(['koshachiy_raskolbas', 'gufenpchela'])
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('getStickers', () => {
    it('should return 401 when not authenticated', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce(null)
      const request = new Request(
        'https://example.com/api/stickers?pack=koshachiy_raskolbas'
      )

      const response = await getStickers(request, mockEnv)

      expect(response.status).toBe(401)
    })

    it('should return 400 when pack parameter is missing', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: {}
      })
      const request = new Request('https://example.com/api/stickers')

      const response = await getStickers(request, mockEnv)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Missing pack parameter')
    })

    it('should return stickers when pack is valid', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: {}
      })
      const mockStickers = [
        { file_id: 'f1', emoji: '😀', set_name: 'pack1' },
        { file_id: 'f2', emoji: '😁', set_name: 'pack1' }
      ]
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({
          json: () =>
            Promise.resolve({ ok: true, result: { stickers: mockStickers } })
        })
      )

      const request = new Request(
        'https://example.com/api/stickers?pack=koshachiy_raskolbas'
      )
      const response = await getStickers(request, mockEnv)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.stickers).toEqual(mockStickers)
      vi.unstubAllGlobals()
    })

    it('should return 400 when Telegram API fails', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: {}
      })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({
          json: () => Promise.resolve({ ok: false })
        })
      )

      const request = new Request(
        'https://example.com/api/stickers?pack=invalid'
      )
      const response = await getStickers(request, mockEnv)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Failed to fetch sticker set')
      vi.unstubAllGlobals()
    })
  })

  describe('getStickerFile', () => {
    it('should return 401 when not authenticated', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce(null)
      const request = new Request(
        'https://example.com/api/sticker-file?file_id=abc123'
      )

      const response = await getStickerFile(request, mockEnv)

      expect(response.status).toBe(401)
      expect(await response.text()).toBe('Unauthorized')
    })

    it('should return 400 when file_id is missing', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: {}
      })
      const request = new Request('https://example.com/api/sticker-file')

      const response = await getStickerFile(request, mockEnv)

      expect(response.status).toBe(400)
      expect(await response.text()).toBe('Missing file_id')
    })

    it('should return 404 when file not found', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: {}
      })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({
          json: () => Promise.resolve({ ok: false })
        })
      )

      const request = new Request(
        'https://example.com/api/sticker-file?file_id=invalid'
      )
      const response = await getStickerFile(request, mockEnv)

      expect(response.status).toBe(404)
      expect(await response.text()).toBe('File not found')
      vi.unstubAllGlobals()
    })

    it('should return sticker file when valid', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: {}
      })
      const mockFileBuffer = new ArrayBuffer(8)
      vi.stubGlobal(
        'fetch',
        vi.fn()
          .mockResolvedValueOnce({
            json: () =>
              Promise.resolve({
                ok: true,
                result: { file_path: 'stickers/file.webp' }
              })
          })
          .mockResolvedValueOnce({
            ok: true,
            arrayBuffer: () => Promise.resolve(mockFileBuffer),
            headers: new Headers({ 'Content-Type': 'image/webp' })
          })
      )

      const request = new Request(
        'https://example.com/api/sticker-file?file_id=valid123'
      )
      const response = await getStickerFile(request, mockEnv)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('image/webp')
      expect(response.headers.get('X-Sticker-Format')).toBe('webp')
      vi.unstubAllGlobals()
    })

    it('should return 502 when file fetch fails', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: {}
      })
      vi.stubGlobal(
        'fetch',
        vi.fn()
          .mockResolvedValueOnce({
            json: () =>
              Promise.resolve({
                ok: true,
                result: { file_path: 'stickers/file.webp' }
              })
          })
          .mockResolvedValueOnce({ ok: false })
      )

      const request = new Request(
        'https://example.com/api/sticker-file?file_id=valid123'
      )
      const response = await getStickerFile(request, mockEnv)

      expect(response.status).toBe(502)
      expect(await response.text()).toBe('Failed to fetch file')
      vi.unstubAllGlobals()
    })
  })
})
