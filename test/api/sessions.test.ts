import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getSessions, getSession, getAdminChats } from '../../src/api/sessions'
import { authenticateRequest } from '../../src/api/auth'
import { SessionController } from '../../src/service/SessionController'
import { AdminAuthService } from '../../src/service/AdminAuthService'

// Mock dependencies
vi.mock('../../src/api/auth')
vi.mock('../../src/service/SessionController')
vi.mock('../../src/service/AdminAuthService')

describe('API Sessions', () => {
  let mockEnv: Env
  let mockRequest: Request
  let mockAdminAuthService: any
  let mockSessionController: any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    mockEnv = {
      BOT_TOKEN: 'test-bot-token',
      CHAT_SESSIONS_STORAGE: {} as any,
      DB: {} as any
    } as Env

    mockAdminAuthService = {
      getAdminChats: vi.fn(),
      verifyAdminStatus: vi.fn(),
      getChatInfo: vi.fn()
    }

    mockSessionController = {
      getSession: vi.fn()
    }

    ;(AdminAuthService as any).mockImplementation(() => mockAdminAuthService)
    ;(SessionController as any).mockImplementation(() => mockSessionController)
  })

  describe('getSessions', () => {
    it('should return 401 when not authenticated', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce(null)
      mockRequest = new Request('https://example.com/api/sessions?_auth=test')

      const response = await getSessions(mockRequest, mockEnv)

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error).toBe('Unauthorized')
    })

    it('should return empty sessions array when user has no admin chats', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: mockAdminAuthService
      })
      mockAdminAuthService.getAdminChats.mockResolvedValueOnce([])
      mockRequest = new Request('https://example.com/api/sessions?_auth=test')

      const response = await getSessions(mockRequest, mockEnv)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.sessions).toEqual([])
    })

    it('should return sessions for admin chats', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: mockAdminAuthService
      })

      const mockSession = {
        model: 'gpt-4',
        prompt: 'Test prompt',
        stickersPacks: ['pack1', 'pack2'],
        memories: [{ content: 'memory1' }, { content: 'memory2' }],
        userMessages: [{ role: 'user', content: 'Hello' }],
        toggle_history: true
      }

      mockAdminAuthService.getAdminChats.mockResolvedValueOnce(['123', '456'])
      mockSessionController.getSession
        .mockResolvedValueOnce(mockSession)
        .mockResolvedValueOnce({ ...mockSession, prompt: 'Different prompt' })

      mockAdminAuthService.getChatInfo
        .mockResolvedValueOnce({ id: 123, title: 'Chat 1', type: 'group' })
        .mockResolvedValueOnce({ id: 456, title: 'Chat 2', type: 'supergroup' })

      mockRequest = new Request('https://example.com/api/sessions?_auth=test')

      const response = await getSessions(mockRequest, mockEnv)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.sessions).toHaveLength(2)
      expect(body.sessions[0]).toMatchObject({
        chatId: '123',
        chatTitle: 'Chat 1',
        model: 'gpt-4',
        stickerPacksCount: 2,
        memoriesCount: 2,
        userMessagesCount: 1,
        toggleHistory: true
      })
      expect(body.sessions[0].promptPreview).toBe('Test prompt')
    })

    it('should truncate long prompts', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: mockAdminAuthService
      })

      const longPrompt = 'a'.repeat(150)
      const mockSession = {
        model: 'gpt-4',
        prompt: longPrompt,
        stickersPacks: [],
        memories: [],
        userMessages: [],
        toggle_history: false
      }

      mockAdminAuthService.getAdminChats.mockResolvedValueOnce(['123'])
      mockSessionController.getSession.mockResolvedValueOnce(mockSession)
      mockAdminAuthService.getChatInfo.mockResolvedValueOnce({
        id: 123,
        title: 'Chat 1',
        type: 'group'
      })

      mockRequest = new Request('https://example.com/api/sessions?_auth=test')

      const response = await getSessions(mockRequest, mockEnv)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.sessions[0].promptPreview).toBe('a'.repeat(100) + '...')
    })

    it('should handle missing chat info gracefully', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: mockAdminAuthService
      })

      const mockSession = {
        model: 'gpt-4',
        prompt: 'Test',
        stickersPacks: [],
        memories: [],
        userMessages: [],
        toggle_history: false
      }

      mockAdminAuthService.getAdminChats.mockResolvedValueOnce(['123'])
      mockSessionController.getSession.mockResolvedValueOnce(mockSession)
      mockAdminAuthService.getChatInfo.mockResolvedValueOnce(null)

      mockRequest = new Request('https://example.com/api/sessions?_auth=test')

      const response = await getSessions(mockRequest, mockEnv)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.sessions[0].chatTitle).toBe('Chat 123')
    })

    it('should handle errors when getting session', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: mockAdminAuthService
      })

      mockAdminAuthService.getAdminChats.mockResolvedValueOnce(['123', '456'])
      mockSessionController.getSession
        .mockRejectedValueOnce(new Error('Session error'))
        .mockResolvedValueOnce({
          model: 'gpt-4',
          prompt: 'Test',
          stickersPacks: [],
          memories: [],
          userMessages: [],
          toggle_history: false
        })

      mockAdminAuthService.getChatInfo.mockResolvedValueOnce({
        id: 456,
        title: 'Chat 2',
        type: 'group'
      })

      mockRequest = new Request('https://example.com/api/sessions?_auth=test')

      const response = await getSessions(mockRequest, mockEnv)

      expect(response.status).toBe(200)
      const body = await response.json()
      // Should only include the session that didn't error
      expect(body.sessions).toHaveLength(1)
      expect(body.sessions[0].chatId).toBe('456')
    })

    it('should include CORS headers', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: mockAdminAuthService
      })

      const mockSession = {
        model: 'gpt-4',
        prompt: 'Test prompt',
        stickersPacks: [],
        memories: [],
        userMessages: [],
        toggle_history: false
      }

      mockAdminAuthService.getAdminChats.mockResolvedValueOnce(['123'])
      mockSessionController.getSession.mockResolvedValueOnce(mockSession)
      mockAdminAuthService.getChatInfo.mockResolvedValueOnce({
        id: 123,
        title: 'Chat 1',
        type: 'group'
      })

      mockRequest = new Request('https://example.com/api/sessions?_auth=test')

      const response = await getSessions(mockRequest, mockEnv)

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('getSession', () => {
    it('should return 401 when not authenticated', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce(null)
      mockRequest = new Request('https://example.com/api/sessions/123?_auth=test')

      const response = await getSession(mockRequest, mockEnv, '123')

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error).toBe('Unauthorized')
    })

    it('should return 403 when user is not admin of chat', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: mockAdminAuthService
      })

      mockAdminAuthService.verifyAdminStatus.mockResolvedValueOnce(false)
      mockRequest = new Request('https://example.com/api/sessions/456?_auth=test')

      const response = await getSession(mockRequest, mockEnv, '456')

      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body.error).toBe('Forbidden')
    })

    it('should return session data when user is admin', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: mockAdminAuthService
      })

      const mockSessionData = {
        model: 'gpt-4',
        prompt: 'Test prompt',
        stickersPacks: ['pack1'],
        memories: [{ content: 'memory' }],
        userMessages: [{ role: 'user', content: 'Hello' }],
        toggle_history: true,
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        chat_settings: { thread_id: undefined }
      }

      mockAdminAuthService.verifyAdminStatus.mockResolvedValueOnce(true)
      mockSessionController.getSession.mockResolvedValueOnce(mockSessionData)
      mockAdminAuthService.getChatInfo.mockResolvedValueOnce({
        id: 123,
        title: 'Test Chat',
        type: 'group'
      })

      mockRequest = new Request('https://example.com/api/sessions/123?_auth=test')

      const response = await getSession(mockRequest, mockEnv, '123')

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({
        chatId: '123',
        chatInfo: {
          id: 123,
          title: 'Test Chat',
          type: 'group'
        },
        session: mockSessionData
      })
      expect(mockAdminAuthService.verifyAdminStatus).toHaveBeenCalledWith('123', 123)
    })

    it('should include CORS headers', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: mockAdminAuthService
      })

      mockAdminAuthService.verifyAdminStatus.mockResolvedValueOnce(true)
      mockSessionController.getSession.mockResolvedValueOnce({
        model: 'gpt-4',
        prompt: '',
        stickersPacks: [],
        memories: [],
        userMessages: [],
        toggle_history: false
      })
      mockAdminAuthService.getChatInfo.mockResolvedValueOnce(null)

      mockRequest = new Request('https://example.com/api/sessions/123?_auth=test')

      const response = await getSession(mockRequest, mockEnv, '123')

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('getAdminChats', () => {
    it('should return 401 when not authenticated', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce(null)
      mockRequest = new Request('https://example.com/api/admin/chats?_auth=test')

      const response = await getAdminChats(mockRequest, mockEnv)

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error).toBe('Unauthorized')
    })

    it('should return empty chats array when user has no admin chats', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: mockAdminAuthService
      })

      mockAdminAuthService.getAdminChats.mockResolvedValueOnce([])
      mockRequest = new Request('https://example.com/api/admin/chats?_auth=test')

      const response = await getAdminChats(mockRequest, mockEnv)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.chats).toEqual([])
    })

    it('should return chats with info', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: mockAdminAuthService
      })

      mockAdminAuthService.getAdminChats.mockResolvedValueOnce(['123', '456'])
      mockAdminAuthService.getChatInfo
        .mockResolvedValueOnce({ id: 123, title: 'Chat 1', type: 'group' })
        .mockResolvedValueOnce({
          id: 456,
          title: 'Chat 2',
          type: 'supergroup'
        })

      mockRequest = new Request('https://example.com/api/admin/chats?_auth=test')

      const response = await getAdminChats(mockRequest, mockEnv)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.chats).toHaveLength(2)
      expect(body.chats[0]).toEqual({
        chatId: '123',
        title: 'Chat 1',
        type: 'group'
      })
      expect(body.chats[1]).toEqual({
        chatId: '456',
        title: 'Chat 2',
        type: 'supergroup'
      })
    })

    it('should handle missing chat info', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: mockAdminAuthService
      })

      mockAdminAuthService.getAdminChats.mockResolvedValueOnce(['123', '456'])
      mockAdminAuthService.getChatInfo
        .mockResolvedValueOnce({ id: 123, title: 'Chat 1', type: 'group' })
        .mockResolvedValueOnce(null)

      mockRequest = new Request('https://example.com/api/admin/chats?_auth=test')

      const response = await getAdminChats(mockRequest, mockEnv)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.chats[1].title).toBe('Chat 456')
    })

    it('should include CORS headers', async () => {
      ;(authenticateRequest as any).mockResolvedValueOnce({
        userId: 123,
        adminAuthService: mockAdminAuthService
      })

      mockAdminAuthService.getAdminChats.mockResolvedValueOnce([])
      mockRequest = new Request('https://example.com/api/admin/chats?_auth=test')

      const response = await getAdminChats(mockRequest, mockEnv)

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })
})

