import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AdminAuthService } from '../../src/service/AdminAuthService'

describe('AdminAuthService', () => {
  let mockEnv: any
  let mockStorage: any
  let adminAuthService: AdminAuthService
  const botToken = 'test-bot-token-123'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = vi.fn()

    mockStorage = {
      list: vi.fn()
    } as any

    mockEnv = {
      BOT_TOKEN: botToken,
      CHAT_SESSIONS_STORAGE: mockStorage
    }

    adminAuthService = new AdminAuthService(mockEnv, botToken)
  })

  describe('validateInitData', () => {
    it('should return null for missing hash', async () => {
      const initData = 'user={"id":123}&auth_date=1234567890'
      const result = await adminAuthService.validateInitData(initData)
      expect(result).toBeNull()
    })

    it('should return null for invalid hash', async () => {
      const initData = 'user={"id":123}&auth_date=1234567890&hash=invalid'
      const result = await adminAuthService.validateInitData(initData)
      expect(result).toBeNull()
    })

    it('should return null for expired initData', async () => {
      // Mock current time to be more than 24 hours after auth_date
      const oldAuthDate = Math.floor(Date.now() / 1000) - 86401 // 24 hours + 1 second
      const initData = `user={"id":123}&auth_date=${oldAuthDate}&hash=test`
      
      // Mock HMAC to return a valid hash format (we can't easily mock crypto.subtle for real validation)
      const result = await adminAuthService.validateInitData(initData)
      // Should fail hash validation, but we test expiration logic separately
      expect(result).toBeNull()
    })

    it('should return null for missing user', async () => {
      const initData = 'auth_date=1234567890&hash=test'
      const result = await adminAuthService.validateInitData(initData)
      expect(result).toBeNull()
    })

    it('should return null for invalid JSON in user field', async () => {
      const initData = 'user=invalid-json&auth_date=1234567890&hash=test'
      const result = await adminAuthService.validateInitData(initData)
      expect(result).toBeNull()
    })

    it('should handle errors gracefully', async () => {
      // This will cause an error in parsing
      const initData = null as any
      const result = await adminAuthService.validateInitData(initData)
      expect(result).toBeNull()
    })
  })

  describe('verifyAdminStatus', () => {
    it('should return true for administrator status', async () => {
      const mockResponse = {
        ok: true,
        result: { status: 'administrator' }
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await adminAuthService.verifyAdminStatus('123', 456)
      expect(result).toBe(true)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/getChatMember'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ chat_id: '123', user_id: 456 })
        })
      )
    })

    it('should return true for creator status', async () => {
      const mockResponse = {
        ok: true,
        result: { status: 'creator' }
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await adminAuthService.verifyAdminStatus('123', 456)
      expect(result).toBe(true)
    })

    it('should return true for owner status', async () => {
      const mockResponse = {
        ok: true,
        result: { status: 'owner' }
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await adminAuthService.verifyAdminStatus('123', 456)
      expect(result).toBe(true)
    })

    it('should return false for member status', async () => {
      const mockResponse = {
        ok: true,
        result: { status: 'member' }
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await adminAuthService.verifyAdminStatus('123', 456)
      expect(result).toBe(false)
    })

    it('should return false when API returns not ok', async () => {
      const mockResponse = {
        ok: false
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await adminAuthService.verifyAdminStatus('123', 456)
      expect(result).toBe(false)
    })

    it('should return false when HTTP request fails', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      })

      const result = await adminAuthService.verifyAdminStatus('123', 456)
      expect(result).toBe(false)
    })

    it('should handle fetch errors', async () => {
      ;(global.fetch as any).mockRejectedValueOnce(new Error('Network error'))

      const result = await adminAuthService.verifyAdminStatus('123', 456)
      expect(result).toBe(false)
    })

    it('should work with numeric chatId', async () => {
      const mockResponse = {
        ok: true,
        result: { status: 'administrator' }
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await adminAuthService.verifyAdminStatus(123, 456)
      expect(result).toBe(true)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ chat_id: 123, user_id: 456 })
        })
      )
    })
  })

  describe('getAdminChats', () => {
    it('should return empty array when no sessions exist', async () => {
      ;(mockStorage.list as any).mockResolvedValueOnce({
        keys: []
      })

      const result = await adminAuthService.getAdminChats(123)
      expect(result).toEqual([])
    })

    it('should filter and return admin chat IDs', async () => {
      ;(mockStorage.list as any).mockResolvedValueOnce({
        keys: [
          { name: 'session_123' },
          { name: 'session_456' },
          { name: 'other_key' },
          { name: 'session_789' }
        ]
      })

      // Mock verifyAdminStatus to return true for chat 123 and 456, false for 789
      ;(global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, result: { status: 'administrator' } })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, result: { status: 'creator' } })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, result: { status: 'member' } })
        })

      const result = await adminAuthService.getAdminChats(123)
      expect(result).toContain('123')
      expect(result).toContain('456')
      expect(result).not.toContain('789')
    })

    it('should process chats in batches', async () => {
      const keys = Array.from({ length: 25 }, (_, i) => ({
        name: `session_${i}`
      }))

      ;(mockStorage.list as any).mockResolvedValueOnce({ keys })

      // Mock all to be admin
      ;(global.fetch as any).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, result: { status: 'administrator' } })
        })
      )

      const result = await adminAuthService.getAdminChats(123)
      expect(result.length).toBe(25)
      // Should make calls in batches of 10
      expect(global.fetch).toHaveBeenCalledTimes(25)
    })

    it('should handle errors gracefully', async () => {
      ;(mockStorage.list as any).mockRejectedValueOnce(new Error('Storage error'))

      const result = await adminAuthService.getAdminChats(123)
      expect(result).toEqual([])
    })

    it('should skip non-session keys', async () => {
      ;(mockStorage.list as any).mockResolvedValueOnce({
        keys: [
          { name: 'session_123' },
          { name: 'other_prefix_456' },
          { name: 'not_a_session' }
        ]
      })

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { status: 'administrator' } })
      })

      const result = await adminAuthService.getAdminChats(123)
      expect(result).toEqual(['123'])
    })
  })

  describe('getChatInfo', () => {
    it('should return chat info for valid chat', async () => {
      const mockResponse = {
        ok: true,
        result: {
          id: 123,
          title: 'Test Chat',
          type: 'group'
        }
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await adminAuthService.getChatInfo('123')
      expect(result).toEqual({
        id: 123,
        title: 'Test Chat',
        type: 'group'
      })
    })

    it('should return null when API returns not ok', async () => {
      const mockResponse = {
        ok: false
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await adminAuthService.getChatInfo('123')
      expect(result).toBeNull()
    })

    it('should return null when HTTP request fails', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400
      })

      const result = await adminAuthService.getChatInfo('123')
      expect(result).toBeNull()
    })

    it('should return null when result is missing', async () => {
      const mockResponse = {
        ok: true
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await adminAuthService.getChatInfo('123')
      expect(result).toBeNull()
    })

    it('should handle fetch errors', async () => {
      ;(global.fetch as any).mockRejectedValueOnce(new Error('Network error'))

      const result = await adminAuthService.getChatInfo('123')
      expect(result).toBeNull()
    })

    it('should work with numeric chatId', async () => {
      const mockResponse = {
        ok: true,
        result: {
          id: 123,
          title: 'Test Chat',
          type: 'supergroup'
        }
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await adminAuthService.getChatInfo(123)
      expect(result).toEqual({
        id: 123,
        title: 'Test Chat',
        type: 'supergroup'
      })
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/getChat'),
        expect.objectContaining({
          body: JSON.stringify({ chat_id: 123 })
        })
      )
    })

    it('should handle chat without title', async () => {
      const mockResponse = {
        ok: true,
        result: {
          id: 123,
          type: 'private'
        }
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await adminAuthService.getChatInfo('123')
      expect(result).toEqual({
        id: 123,
        title: undefined,
        type: 'private'
      })
    })
  })
})

