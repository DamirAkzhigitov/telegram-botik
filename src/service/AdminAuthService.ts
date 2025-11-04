interface TelegramUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
}

export class AdminAuthService {
  constructor(
    private env: Env,
    private botToken: string
  ) {}

  /**
   * Helper to create HMAC-SHA256 using Web Crypto API
   */
  private async hmacSha256(
    key: ArrayBuffer | Uint8Array,
    data: string
  ): Promise<string> {
    const encoder = new TextEncoder()
    const messageData = encoder.encode(data)

    // Import key for HMAC
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    // Sign the data
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)

    // Convert to hex string
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  /**
   * Validate Telegram Web App initData
   * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
   */
  async validateInitData(initData: string): Promise<TelegramUser | null> {
    try {
      // Parse initData query string
      const params = new URLSearchParams(initData)
      const hash = params.get('hash')
      if (!hash) return null

      // Remove hash from params for validation
      params.delete('hash')

      // Sort parameters alphabetically
      const dataCheckString = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')

      // Create secret key: HMAC-SHA256("WebAppData", bot_token)
      // Note: According to Telegram docs, the key is "WebAppData" and data is bot_token
      const encoder = new TextEncoder()
      const webAppDataBytes = encoder.encode('WebAppData')
      const secretKey = await this.hmacSha256(webAppDataBytes, this.botToken)
      // Convert hex string to bytes
      const secretKeyBytes = new Uint8Array(
        secretKey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
      )

      // Calculate hash: HMAC-SHA256(secret_key, data_check_string)
      const calculatedHash = await this.hmacSha256(
        secretKeyBytes,
        dataCheckString
      )

      // Verify hash
      if (calculatedHash !== hash) {
        console.error('Invalid initData hash')
        return null
      }

      // Check auth_date (should be recent, within 24 hours)
      const authDate = parseInt(params.get('auth_date') || '0', 10)
      const now = Math.floor(Date.now() / 1000)
      if (now - authDate > 86400) {
        console.error('initData expired')
        return null
      }

      // Parse user data
      const userStr = params.get('user')
      if (!userStr) return null

      return JSON.parse(userStr) as TelegramUser
    } catch (error) {
      console.error('Error validating initData:', error)
      return null
    }
  }

  /**
   * Check if user is admin of a chat using Telegram Bot API
   */
  async verifyAdminStatus(
    chatId: string | number,
    userId: number
  ): Promise<boolean> {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/getChatMember`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            user_id: userId
          })
        }
      )

      if (!response.ok) {
        console.error(
          `Failed to get chat member: ${response.status} ${response.statusText}`
        )
        return false
      }

      const jsonData = await response.json()
      const data = jsonData as {
        ok: boolean
        result?: { status: string }
      }
      if (!data.ok) {
        return false
      }

      const status = data.result?.status
      return (
        status === 'administrator' || status === 'creator' || status === 'owner'
      )
    } catch (error) {
      console.error('Error verifying admin status:', error)
      return false
    }
  }

  /**
   * Get all chat IDs from KV storage and filter by admin status
   */
  async getAdminChats(userId: number): Promise<string[]> {
    try {
      // List all keys from KV storage
      const keys = await this.env.CHAT_SESSIONS_STORAGE.list()

      // Extract chat IDs from keys (format: session_{chatId})
      const chatIdSet = new Set<string>()
      for (const key of keys.keys) {
        if (key.name.startsWith('session_')) {
          const chatId = key.name.replace('session_', '')
          chatIdSet.add(chatId)
        }
      }

      // Check admin status for each chat in parallel (with limit)
      const adminChats: string[] = []
      const chatIdArray = Array.from(chatIdSet)

      // Process in batches to avoid rate limits
      const batchSize = 10
      for (let i = 0; i < chatIdArray.length; i += batchSize) {
        const batch = chatIdArray.slice(i, i + batchSize)
        const results = await Promise.all(
          batch.map(async (chatId) => {
            const isAdmin = await this.verifyAdminStatus(chatId, userId)
            return isAdmin ? chatId : null
          })
        )
        adminChats.push(...results.filter((id): id is string => id !== null))
      }

      return adminChats
    } catch (error) {
      console.error('Error getting admin chats:', error)
      return []
    }
  }

  /**
   * Get chat information using Telegram Bot API
   */
  async getChatInfo(chatId: string | number): Promise<{
    id: number
    title?: string
    type: string
  } | null> {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/getChat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId })
        }
      )

      if (!response.ok) {
        return null
      }

      const jsonData = await response.json()
      const data = jsonData as {
        ok: boolean
        result?: {
          id: number
          title?: string
          type: string
        }
      }
      if (!data.ok || !data.result) {
        return null
      }

      return {
        id: data.result.id,
        title: data.result.title,
        type: data.result.type
      }
    } catch (error) {
      console.error('Error getting chat info:', error)
      return null
    }
  }
}
