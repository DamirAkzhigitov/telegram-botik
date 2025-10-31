import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UserService } from '../src/service/UserService'

// Mock D1Database
const mockDb = {
  prepare: vi.fn(),
  exec: vi.fn(),
  batch: vi.fn(),
  dump: vi.fn(),
  close: vi.fn()
}

describe('UserService', () => {
  let userService: UserService

  beforeEach(() => {
    userService = new UserService(mockDb as any)
    vi.clearAllMocks()
  })

  describe('registerOrGetUser', () => {
    it('should create new user with 5 initial coins', async () => {
      const mockUser = {
        id: 1,
        telegram_id: 123456789,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        coins: 5,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }

      // Mock the first SELECT query to return null (user doesn't exist)
      const mockSelectStmt1 = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null)
      }

      // Mock the INSERT query .run()
      const mockInsertStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({})
      }

      // Mock the second SELECT to return the new user
      const mockSelectStmt2 = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser)
      }

      // Mock the logTransaction call
      const mockLogStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({})
      }

      mockDb.prepare
        .mockReturnValueOnce(mockSelectStmt1)  // 1: SELECT (not found)
        .mockReturnValueOnce(mockInsertStmt)   // 2: INSERT users
        .mockReturnValueOnce(mockSelectStmt2)  // 3: SELECT inserted
        .mockReturnValueOnce(mockLogStmt)      // 4: INSERT transactions

      const result = await userService.registerOrGetUser({
        id: 123456789,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User'
      })

      expect(result).toEqual(mockUser)
      // Calls order
      expect(mockDb.prepare).toHaveBeenNthCalledWith(1, 'SELECT * FROM users WHERE telegram_id = ?')
      expect(mockDb.prepare).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO users'))
      expect(mockDb.prepare).toHaveBeenNthCalledWith(3, 'SELECT * FROM users WHERE telegram_id = ?')
      expect(mockDb.prepare).toHaveBeenNthCalledWith(4, expect.stringContaining('INSERT INTO transactions'))
      expect(mockSelectStmt1.bind).toHaveBeenCalledWith(123456789)
      expect(mockInsertStmt.bind).toHaveBeenCalledWith(123456789, 'testuser', 'Test', 'User')
    })

    it('should return existing user if already registered', async () => {
      const existingUser = {
        id: 1,
        telegram_id: 123456789,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        coins: 3,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(existingUser)
      }

      mockDb.prepare.mockReturnValue(mockStmt)

      const result = await userService.registerOrGetUser({
        id: 123456789,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User'
      })

      expect(result).toEqual(existingUser)
      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM users WHERE telegram_id = ?')
    })
  })

  describe('getUserBalance', () => {
    it('should return user balance', async () => {
      const mockUser = {
        id: 1,
        telegram_id: 123456789,
        coins: 10
      }

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser)
      }

      mockDb.prepare.mockReturnValue(mockStmt)

      const balance = await userService.getUserBalance(123456789)

      expect(balance).toBe(10)
    })

    it('should return 0 if user not found', async () => {
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null)
      }

      mockDb.prepare.mockReturnValue(mockStmt)

      const balance = await userService.getUserBalance(123456789)

      expect(balance).toBe(0)
    })
  })

  describe('hasEnoughCoins', () => {
    it('should return true if user has enough coins', async () => {
      const mockUser = {
        id: 1,
        telegram_id: 123456789,
        coins: 10
      }

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser)
      }

      mockDb.prepare.mockReturnValue(mockStmt)

      const hasEnough = await userService.hasEnoughCoins(123456789, 5)

      expect(hasEnough).toBe(true)
    })

    it('should return false if user has insufficient coins', async () => {
      const mockUser = {
        id: 1,
        telegram_id: 123456789,
        coins: 3
      }

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser)
      }

      mockDb.prepare.mockReturnValue(mockStmt)

      const hasEnough = await userService.hasEnoughCoins(123456789, 5)

      expect(hasEnough).toBe(false)
    })
  })

  describe('deductCoins', () => {
    it('should deduct coins successfully', async () => {
      const mockUser = {
        id: 1,
        telegram_id: 123456789,
        coins: 10
      }

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser),
        run: vi.fn().mockResolvedValue({})
      }

      mockDb.prepare.mockReturnValue(mockStmt)

      const success = await userService.deductCoins(123456789, 3, 'test_action')

      expect(success).toBe(true)
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'))
    })

    it('should return false if insufficient coins', async () => {
      const mockUser = {
        id: 1,
        telegram_id: 123456789,
        coins: 2
      }

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser)
      }

      mockDb.prepare.mockReturnValue(mockStmt)

      const success = await userService.deductCoins(123456789, 5, 'test_action')

      expect(success).toBe(false)
    })
  })
}) 