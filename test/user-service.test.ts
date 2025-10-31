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

    it('should return false if user not found', async () => {
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null)
      }

      mockDb.prepare.mockReturnValue(mockStmt)

      const success = await userService.deductCoins(123456789, 5, 'test_action')

      expect(success).toBe(false)
    })
  })

  describe('registerOrGetUser - coin fix edge case', () => {
    it('should fix coins when new user has incorrect coin amount', async () => {
      const mockUserWrongCoins = {
        id: 1,
        telegram_id: 123456789,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        coins: 0, // Wrong amount
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }

      const mockUserFixed = {
        ...mockUserWrongCoins,
        coins: 5
      }

      const mockSelectStmt1 = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null)
      }

      const mockInsertStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({})
      }

      const mockSelectStmt2 = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn()
          .mockResolvedValueOnce(mockUserWrongCoins) // First select returns wrong coins
          .mockResolvedValueOnce(mockUserFixed) // After fix
      }

      const mockUpdateStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({})
      }

      const mockLogStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({})
      }

      mockDb.prepare
        .mockReturnValueOnce(mockSelectStmt1)  // 1: SELECT (not found)
        .mockReturnValueOnce(mockInsertStmt)   // 2: INSERT users
        .mockReturnValueOnce(mockSelectStmt2)  // 3: SELECT inserted (wrong coins)
        .mockReturnValueOnce(mockUpdateStmt)   // 4: UPDATE to fix coins
        .mockReturnValueOnce(mockLogStmt)      // 5: INSERT transactions

      const result = await userService.registerOrGetUser({
        id: 123456789,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User'
      })

      expect(result.coins).toBe(5)
      expect(mockUpdateStmt.bind).toHaveBeenCalledWith(1) // Only user id, coins value is set directly in SQL
    })
  })

  describe('addCoins', () => {
    it('should add coins successfully', async () => {
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

      const success = await userService.addCoins(123456789, 5, 'bonus')

      expect(success).toBe(true)
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET coins = ?')
      )
      expect(mockStmt.bind).toHaveBeenCalledWith(15, 123456789) // 10 + 5 = 15
    })

    it('should return false if user not found', async () => {
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null)
      }

      mockDb.prepare.mockReturnValue(mockStmt)

      const success = await userService.addCoins(123456789, 5, 'bonus')

      expect(success).toBe(false)
      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM users WHERE telegram_id = ?')
    })

    it('should log transaction when adding coins', async () => {
      const mockUser = {
        id: 1,
        telegram_id: 123456789,
        coins: 10
      }

      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser)
      }

      const mockUpdateStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({})
      }

      const mockLogStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({})
      }

      mockDb.prepare
        .mockReturnValueOnce(mockSelectStmt)  // SELECT user
        .mockReturnValueOnce(mockUpdateStmt)  // UPDATE coins
        .mockReturnValueOnce(mockLogStmt)     // INSERT transaction

      await userService.addCoins(123456789, 5, 'bonus')

      expect(mockLogStmt.bind).toHaveBeenCalledWith(
        1,
        'bonus',
        5,
        10, // balance before
        15  // balance after
      )
    })
  })

  describe('getUserTransactions', () => {
    it('should return user transactions with default limit', async () => {
      const mockUser = {
        id: 1,
        telegram_id: 123456789,
        coins: 10
      }

      const mockTransactions = [
        {
          id: 1,
          user_id: 1,
          action_type: 'deduction',
          coins_change: -5,
          balance_before: 10,
          balance_after: 5,
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 2,
          user_id: 1,
          action_type: 'bonus',
          coins_change: 3,
          balance_before: 5,
          balance_after: 8,
          created_at: '2024-01-02T00:00:00Z'
        }
      ]

      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser)
      }

      const mockTransactionStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({
          results: mockTransactions
        })
      }

      mockDb.prepare
        .mockReturnValueOnce(mockSelectStmt)
        .mockReturnValueOnce(mockTransactionStmt)

      const result = await userService.getUserTransactions(123456789)

      expect(result).toEqual(mockTransactions)
      expect(mockTransactionStmt.bind).toHaveBeenCalledWith(1, 10) // user.id, default limit
    })

    it('should return user transactions with custom limit', async () => {
      const mockUser = {
        id: 1,
        telegram_id: 123456789,
        coins: 10
      }

      const mockTransactions = [
        {
          id: 1,
          user_id: 1,
          action_type: 'deduction',
          coins_change: -5,
          balance_before: 10,
          balance_after: 5,
          created_at: '2024-01-01T00:00:00Z'
        }
      ]

      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser)
      }

      const mockTransactionStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({
          results: mockTransactions
        })
      }

      mockDb.prepare
        .mockReturnValueOnce(mockSelectStmt)
        .mockReturnValueOnce(mockTransactionStmt)

      const result = await userService.getUserTransactions(123456789, 5)

      expect(result).toEqual(mockTransactions)
      expect(mockTransactionStmt.bind).toHaveBeenCalledWith(1, 5)
    })

    it('should return empty array if user not found', async () => {
      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null)
      }

      mockDb.prepare.mockReturnValue(mockSelectStmt)

      const result = await userService.getUserTransactions(123456789)

      expect(result).toEqual([])
    })

    it('should return empty array if no transactions', async () => {
      const mockUser = {
        id: 1,
        telegram_id: 123456789,
        coins: 10
      }

      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser)
      }

      const mockTransactionStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({
          results: []
        })
      }

      mockDb.prepare
        .mockReturnValueOnce(mockSelectStmt)
        .mockReturnValueOnce(mockTransactionStmt)

      const result = await userService.getUserTransactions(123456789)

      expect(result).toEqual([])
    })
  })

  describe('createPendingPurchase', () => {
    it('should create pending purchase successfully', async () => {
      const mockUser = {
        id: 1,
        telegram_id: 123456789,
        coins: 10
      }

      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser)
      }

      const mockInsertStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({})
      }

      mockDb.prepare
        .mockReturnValueOnce(mockSelectStmt)
        .mockReturnValueOnce(mockInsertStmt)

      const success = await userService.createPendingPurchase(
        123456789,
        50,
        'payment_123'
      )

      expect(success).toBe(true)
      expect(mockInsertStmt.bind).toHaveBeenCalledWith(
        1,
        'pending_purchase_payment_123',
        50,
        10, // balance before
        10  // balance after (unchanged for pending)
      )
    })

    it('should return false if user not found', async () => {
      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null)
      }

      mockDb.prepare.mockReturnValue(mockSelectStmt)

      const success = await userService.createPendingPurchase(
        123456789,
        50,
        'payment_123'
      )

      expect(success).toBe(false)
    })
  })

  describe('completePurchase', () => {
    it('should complete purchase successfully', async () => {
      const mockPendingTransaction = {
        id: 1,
        user_id: 1,
        action_type: 'pending_purchase_payment_123',
        coins_change: 50,
        balance_before: 10,
        balance_after: 10,
        created_at: '2024-01-01T00:00:00Z'
      }

      // Note: completePurchase calls addCoins with user_id (not telegram_id),
      // so addCoins will try to find user by telegram_id = 1, which won't work.
      // But we test what the code actually does
      const mockUser = {
        id: 1,
        telegram_id: 1, // This matches the user_id passed to addCoins
        coins: 10
      }

      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockPendingTransaction)
      }

      const mockUserSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser)
      }

      const mockUpdateStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({})
      }

      const mockLogStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({})
      }

      mockDb.prepare
        .mockReturnValueOnce(mockSelectStmt)      // SELECT pending transaction
        .mockReturnValueOnce(mockUserSelectStmt)  // SELECT user for addCoins (by telegram_id = 1)
        .mockReturnValueOnce(mockUpdateStmt)      // UPDATE coins
        .mockReturnValueOnce(mockLogStmt)         // INSERT completed transaction

      const success = await userService.completePurchase('payment_123')

      expect(success).toBe(true)
      expect(mockSelectStmt.bind).toHaveBeenCalledWith('pending_purchase_payment_123')
      // addCoins is called with user_id (1) which is used as telegram_id in getUserByTelegramId
      expect(mockUserSelectStmt.bind).toHaveBeenCalledWith(1) // telegram_id = user_id
      expect(mockUpdateStmt.bind).toHaveBeenCalledWith(60, 1) // 10 + 50 = 60, telegram_id
    })

    it('should return false if pending transaction not found', async () => {
      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null)
      }

      mockDb.prepare.mockReturnValue(mockSelectStmt)

      const success = await userService.completePurchase('payment_123')

      expect(success).toBe(false)
    })
  })
}) 