export interface User {
  id: number
  telegram_id: number
  username?: string
  first_name?: string
  last_name?: string
  coins: number
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: number
  user_id: number
  action_type: string
  coins_change: number
  balance_before: number
  balance_after: number
  created_at: string
}

export class UserService {
  constructor(private db: D1Database) {}

  /**
   * Register a new user or get existing user
   * @param telegramUser Telegram user object
   * @returns User object
   */
  async registerOrGetUser(telegramUser: {
    id: number
    username?: string
    first_name?: string
    last_name?: string
  }): Promise<User> {
    // First, try to get existing user
    const existingUser = await this.getUserByTelegramId(telegramUser.id)

    console.log('existingUser: ', existingUser)

    if (existingUser) {
      return existingUser
    }

    // If user doesn't exist, create new user with 5 initial coins
    const result = await this.db
      .prepare(
        `
        INSERT INTO users (telegram_id, username, first_name, last_name, coins)
        VALUES (?, ?, ?, ?, 5)
        RETURNING *
      `
      )
      .bind(
        telegramUser.id,
        telegramUser.username || null,
        telegramUser.first_name || null,
        telegramUser.last_name || null
      )
      .first<User>()

    console.log('result: ', result)

    if (!result) {
      throw new Error('Failed to create user')
    }

    // Log the initial coin transaction
    await this.logTransaction(result.id, 'registration', 5, 0, 5)

    return result
  }

  /**
   * Get user by Telegram ID
   * @param telegramId Telegram user ID
   * @returns User object or null if not found
   */
  async getUserByTelegramId(telegramId: number): Promise<User | null> {
    const result = await this.db
      .prepare('SELECT * FROM users WHERE telegram_id = ?')
      .bind(telegramId)
      .first<User>()

    return result || null
  }

  /**
   * Get user balance
   * @param telegramId Telegram user ID
   * @returns Current coin balance
   */
  async getUserBalance(telegramId: number): Promise<number> {
    const user = await this.getUserByTelegramId(telegramId)
    return user?.coins || 0
  }

  /**
   * Check if user has enough coins for an action
   * @param telegramId Telegram user ID
   * @param requiredCoins Number of coins required
   * @returns True if user has enough coins
   */
  async hasEnoughCoins(
    telegramId: number,
    requiredCoins: number
  ): Promise<boolean> {
    const balance = await this.getUserBalance(telegramId)
    return balance >= requiredCoins
  }

  /**
   * Deduct coins from user account
   * @param telegramId Telegram user ID
   * @param coins Number of coins to deduct
   * @param actionType Type of action (e.g., 'image_generation')
   * @returns True if successful, false if insufficient coins
   */
  async deductCoins(
    telegramId: number,
    coins: number,
    actionType: string
  ): Promise<boolean> {
    const user = await this.getUserByTelegramId(telegramId)

    if (!user || user.coins < coins) {
      return false
    }

    const newBalance = user.coins - coins

    // Update user balance
    await this.db
      .prepare(
        'UPDATE users SET coins = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?'
      )
      .bind(newBalance, telegramId)
      .run()

    // Log the transaction
    await this.logTransaction(
      user.id,
      actionType,
      -coins,
      user.coins,
      newBalance
    )

    return true
  }

  /**
   * Add coins to user account
   * @param telegramId Telegram user ID
   * @param coins Number of coins to add
   * @param actionType Type of action (e.g., 'bonus', 'refund')
   * @returns True if successful
   */
  async addCoins(
    telegramId: number,
    coins: number,
    actionType: string
  ): Promise<boolean> {
    const user = await this.getUserByTelegramId(telegramId)

    if (!user) {
      return false
    }

    const newBalance = user.coins + coins

    // Update user balance
    await this.db
      .prepare(
        'UPDATE users SET coins = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?'
      )
      .bind(newBalance, telegramId)
      .run()

    // Log the transaction
    await this.logTransaction(
      user.id,
      actionType,
      coins,
      user.coins,
      newBalance
    )

    return true
  }

  /**
   * Get user transaction history
   * @param telegramId Telegram user ID
   * @param limit Number of transactions to return (default: 10)
   * @returns Array of transactions
   */
  async getUserTransactions(
    telegramId: number,
    limit: number = 10
  ): Promise<Transaction[]> {
    const user = await this.getUserByTelegramId(telegramId)

    if (!user) {
      return []
    }

    const result = await this.db
      .prepare(
        `
        SELECT * FROM transactions
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `
      )
      .bind(user.id, limit)
      .all<Transaction>()

    return result.results || []
  }

  /**
   * Log a transaction
   * @param userId User ID
   * @param actionType Type of action
   * @param coinsChange Change in coins (positive for addition, negative for deduction)
   * @param balanceBefore Balance before transaction
   * @param balanceAfter Balance after transaction
   */
  private async logTransaction(
    userId: number,
    actionType: string,
    coinsChange: number,
    balanceBefore: number,
    balanceAfter: number
  ): Promise<void> {
    await this.db
      .prepare(
        `
        INSERT INTO transactions (user_id, action_type, coins_change, balance_before, balance_after)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .bind(userId, actionType, coinsChange, balanceBefore, balanceAfter)
      .run()
  }

  /**
   * Create a pending purchase record
   * @param telegramId Telegram user ID
   * @param amount Number of coins to purchase
   * @param paymentId Unique payment identifier
   * @returns True if successful
   */
  async createPendingPurchase(
    telegramId: number,
    amount: number,
    paymentId: string
  ): Promise<boolean> {
    const user = await this.getUserByTelegramId(telegramId)

    if (!user) {
      return false
    }

    // Store pending purchase in database
    // You might want to create a separate table for pending purchases
    // For now, we'll log it as a transaction with pending status
    await this.db
      .prepare(
        `
        INSERT INTO transactions (user_id, action_type, coins_change, balance_before, balance_after)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .bind(user.id, `pending_purchase_${paymentId}`, amount, user.coins, user.coins)
      .run()

    return true
  }

  /**
   * Complete a pending purchase and add coins to user account
   * @param paymentId Payment identifier
   * @returns True if successful
   */
  async completePurchase(paymentId: string): Promise<boolean> {
    // Find the pending purchase transaction
    const pendingTransaction = await this.db
      .prepare(
        `
        SELECT * FROM transactions 
        WHERE action_type = ? 
        ORDER BY created_at DESC 
        LIMIT 1
      `
      )
      .bind(`pending_purchase_${paymentId}`)
      .first<Transaction>()

    if (!pendingTransaction) {
      return false
    }

    // Add coins to user account
    const success = await this.addCoins(
      pendingTransaction.user_id,
      pendingTransaction.coins_change,
      `purchase_completed_${paymentId}`
    )

    return success
  }
}
