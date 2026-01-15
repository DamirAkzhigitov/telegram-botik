/**
 * Telegram Bot API client wrapper for integration tests
 * Handles sending messages and retrieving bot replies
 */

import type { Update, Message } from 'telegraf/types'
import { INTEGRATION_CONFIG } from './config'

interface SendMessageOptions {
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2'
  reply_to_message_id?: number
}

interface TelegramResponse<T> {
  ok: boolean
  result: T
  description?: string
}

export class TelegramClient {
  private readonly botToken: string
  private readonly apiUrl: string
  private lastUpdateId: number = 0

  constructor(botToken: string) {
    this.botToken = botToken
    this.apiUrl = `https://api.telegram.org/bot${botToken}`
  }

  /**
   * Send a message to the bot via Telegram API
   * This will trigger Telegram to send a webhook to the worker
   */
  async sendMessage(
    chatId: string,
    text: string,
    options?: SendMessageOptions
  ): Promise<Message.TextMessage> {
    const response = await fetch(`${this.apiUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...options
      })
    })

    const data =
      (await response.json()) as TelegramResponse<Message.TextMessage>

    if (!data.ok) {
      throw new Error(
        `Failed to send message: ${data.description || 'Unknown error'}`
      )
    }

    return data.result
  }

  /**
   * Get updates from Telegram Bot API
   * Note: This only works when webhook is NOT set
   * For webhook-based bots, we need to use getChatHistory instead
   */
  async getUpdates(offset?: number): Promise<Update[]> {
    const response = await fetch(
      `${this.apiUrl}/getUpdates?offset=${offset || this.lastUpdateId}&timeout=1`,
      {
        method: 'GET'
      }
    )

    const data = (await response.json()) as TelegramResponse<Update[]>

    if (!data.ok) {
      throw new Error(
        `Failed to get updates: ${data.description || 'Unknown error'}`
      )
    }

    if (data.result.length > 0) {
      this.lastUpdateId =
        Math.max(...data.result.map((u) => u.update_id)) + 1
    }

    return data.result
  }

  /**
   * Get chat history (messages in the chat)
   * This is useful when webhook is set and we can't use getUpdates
   * Note: Bot can only see messages it sent or messages where it's mentioned
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getChatHistory(_chatId: string): Promise<Message[]> {
    // Telegram Bot API doesn't have a direct getChatHistory method
    // We'll use getUpdates as a fallback, or we can use forwardMessage
    // For now, we'll return an empty array and use getUpdates in tests
    return []
  }

  /**
   * Wait for a bot reply after sending a message
   * Polls Telegram API for updates until a reply is found or timeout
   */
  async waitForReply(
    chatId: string,
    afterMessageId: number,
    timeout: number = INTEGRATION_CONFIG.testTimeout
  ): Promise<Message | null> {
    const startTime = Date.now()
    const pollInterval = 2000 // Poll every 2 seconds

    while (Date.now() - startTime < timeout) {
      try {
        const updates = await this.getUpdates()

        // Find a message from the bot in the specified chat
        for (const update of updates) {
          if (
            update.message &&
            update.message.chat.id.toString() === chatId.toString() &&
            update.message.message_id > afterMessageId &&
            update.message.from?.is_bot === true
          ) {
            return update.message as Message
          }
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollInterval))
      } catch {
        // If getUpdates fails (e.g., webhook is set), we need an alternative
        // For now, we'll throw after timeout
        if (Date.now() - startTime >= timeout) {
          return null
        }
        await new Promise((resolve) => setTimeout(resolve, pollInterval))
      }
    }

    return null
  }

  /**
   * Send a webhook update directly to the worker
   * This is useful for testing without going through Telegram's webhook system
   */
  async sendWebhookUpdate(
    workerUrl: string,
    update: Update
  ): Promise<Response> {
    return fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    })
  }

  /**
   * Get information about the bot
   */
  async getMe(): Promise<{
    id: number
    is_bot: boolean
    first_name: string
    username: string
    can_join_groups?: boolean
    can_read_all_group_messages?: boolean
    supports_inline_queries?: boolean
  }> {
    const response = await fetch(`${this.apiUrl}/getMe`, {
      method: 'GET'
    })

    const data = (await response.json()) as TelegramResponse<{
      id: number
      is_bot: boolean
      first_name: string
      username: string
      can_join_groups?: boolean
      can_read_all_group_messages?: boolean
      supports_inline_queries?: boolean
    }>

    if (!data.ok) {
      throw new Error(
        `Failed to get bot info: ${data.description || 'Unknown error'}`
      )
    }

    return data.result
  }
}

