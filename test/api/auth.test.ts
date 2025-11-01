import { describe, it, expect, beforeEach, vi } from 'vitest'
import { authenticateRequest } from '../../src/api/auth'
import { AdminAuthService } from '../../src/service/AdminAuthService'

// Mock AdminAuthService
vi.mock('../../src/service/AdminAuthService', () => ({
  AdminAuthService: vi.fn()
}))

describe('authenticateRequest', () => {
  let mockEnv: Env
  let mockAdminAuthService: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockEnv = {
      BOT_TOKEN: 'test-bot-token-123',
      CHAT_SESSIONS_STORAGE: {} as any
    } as Env

    mockAdminAuthService = {
      validateInitData: vi.fn()
    }

    ;(AdminAuthService as any).mockImplementation(() => mockAdminAuthService)
  })

  it('should return authenticated user when initData is valid', async () => {
    const user = { id: 123, first_name: 'Test', username: 'testuser' }
    mockAdminAuthService.validateInitData.mockResolvedValueOnce(user)

    const url = 'https://example.com/api/sessions?_auth=validInitData'
    const request = new Request(url)

    const result = await authenticateRequest(request, mockEnv)

    expect(result).toEqual({
      userId: 123,
      adminAuthService: mockAdminAuthService
    })
    expect(mockAdminAuthService.validateInitData).toHaveBeenCalledWith('validInitData')
  })

  it('should use initData query parameter', async () => {
    const user = { id: 456 }
    mockAdminAuthService.validateInitData.mockResolvedValueOnce(user)

    const url = 'https://example.com/api/sessions?initData=testData'
    const request = new Request(url)

    const result = await authenticateRequest(request, mockEnv)

    expect(result).toEqual({
      userId: 456,
      adminAuthService: mockAdminAuthService
    })
    expect(mockAdminAuthService.validateInitData).toHaveBeenCalledWith('testData')
  })

  it('should prefer _auth parameter over initData', async () => {
    const user = { id: 789 }
    mockAdminAuthService.validateInitData.mockResolvedValueOnce(user)

    const url = 'https://example.com/api/sessions?_auth=preferred&initData=ignored'
    const request = new Request(url)

    const result = await authenticateRequest(request, mockEnv)

    expect(result).toEqual({
      userId: 789,
      adminAuthService: mockAdminAuthService
    })
    expect(mockAdminAuthService.validateInitData).toHaveBeenCalledWith('preferred')
  })

  it('should return null when no auth parameters are present', async () => {
    const url = 'https://example.com/api/sessions'
    const request = new Request(url)

    const result = await authenticateRequest(request, mockEnv)

    expect(result).toBeNull()
    expect(mockAdminAuthService.validateInitData).not.toHaveBeenCalled()
  })

  it('should return null when initData is empty string', async () => {
    const url = 'https://example.com/api/sessions?_auth='
    const request = new Request(url)

    const result = await authenticateRequest(request, mockEnv)

    expect(result).toBeNull()
    // When initData is empty, the function returns early without calling validateInitData
    expect(mockAdminAuthService.validateInitData).not.toHaveBeenCalled()
  })

  it('should return null when validateInitData returns null', async () => {
    mockAdminAuthService.validateInitData.mockResolvedValueOnce(null)

    const url = 'https://example.com/api/sessions?_auth=invalidData'
    const request = new Request(url)

    const result = await authenticateRequest(request, mockEnv)

    expect(result).toBeNull()
    expect(mockAdminAuthService.validateInitData).toHaveBeenCalledWith('invalidData')
  })

  it('should create AdminAuthService with correct parameters', async () => {
    const user = { id: 999 }
    mockAdminAuthService.validateInitData.mockResolvedValueOnce(user)

    const url = 'https://example.com/api/sessions?_auth=test'
    const request = new Request(url)

    await authenticateRequest(request, mockEnv)

    expect(AdminAuthService).toHaveBeenCalledWith(mockEnv, 'test-bot-token-123')
  })

  it('should handle URL-encoded auth data', async () => {
    const user = { id: 111 }
    const encodedAuth = encodeURIComponent('test=data&more=info')
    mockAdminAuthService.validateInitData.mockResolvedValueOnce(user)

    const url = `https://example.com/api/sessions?_auth=${encodedAuth}`
    const request = new Request(url)

    const result = await authenticateRequest(request, mockEnv)

    expect(result).not.toBeNull()
    expect(mockAdminAuthService.validateInitData).toHaveBeenCalledWith(
      'test=data&more=info'
    )
  })
})

