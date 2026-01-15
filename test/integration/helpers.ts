/**
 * Integration test helpers and utilities
 * Provides test isolation, message verification, and retry logic
 */

import type { Message } from 'telegraf/types'
import { TelegramClient } from './telegramClient'

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (attempt < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, delay * attempt)
        )
      }
    }
  }

  throw lastError!
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => Promise<boolean> | boolean,
  timeout: number = 10000,
  interval: number = 500
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const result = await condition()
    if (result) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }

  throw new Error(`Condition not met within ${timeout}ms`)
}

/**
 * Verify that a message contains expected text
 */
export function messageContains(
  message: Message | null,
  expectedText: string
): boolean {
  if (!message) return false

  if ('text' in message && typeof message.text === 'string') {
    return message.text.toLowerCase().includes(expectedText.toLowerCase())
  }

  return false
}

/**
 * Verify that a message matches expected text exactly
 */
export function messageEquals(
  message: Message | null,
  expectedText: string
): boolean {
  if (!message) return false

  if ('text' in message && typeof message.text === 'string') {
    return message.text.trim() === expectedText.trim()
  }

  return false
}

/**
 * Extract text from a message
 */
export function getMessageText(message: Message | null): string {
  if (!message) return ''

  if ('text' in message && typeof message.text === 'string') {
    return message.text
  }

  if ('caption' in message && typeof message.caption === 'string') {
    return message.caption
  }

  return ''
}

/**
 * Create a test isolation helper that sends a marker message
 * This helps identify test boundaries in chat history
 */
export async function createTestMarker(
  client: TelegramClient,
  chatId: string,
  testName: string
): Promise<Message.TextMessage> {
  const markerText = `🧪 TEST_MARKER: ${testName} - ${Date.now()}`
  return await client.sendMessage(chatId, markerText)
}

/**
 * Clean up chat by sending a marker and optionally deleting messages
 * Note: Bot can't delete messages it didn't send, so this is limited
 */
export async function cleanupTestChat(
  client: TelegramClient,
  chatId: string,
  testName: string
): Promise<void> {
  try {
    await createTestMarker(client, chatId, `CLEANUP_${testName}`)
  } catch (error) {
    // Ignore cleanup errors
    console.warn('Cleanup failed:', error)
  }
}

/**
 * Wait for bot to be ready by checking if it responds to a simple message
 */
export async function waitForBotReady(
  client: TelegramClient,
  chatId: string,
  timeout: number = 30000
): Promise<boolean> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      // Try to get bot info
      await client.getMe()
      return true
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  return false
}

/**
 * Verify worker webhook is accessible
 */
export async function verifyWorkerWebhook(
  workerUrl: string
): Promise<boolean> {
  try {
    const response = await fetch(workerUrl, {
      method: 'GET'
    })

    // Worker should return OK or 405 (Method Not Allowed) for GET
    return response.status === 200 || response.status === 405
  } catch {
    return false
  }
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Create a test update object for direct webhook testing
 */
export function createTestUpdate(
  chatId: string | number,
  text: string,
  fromId: number = 123456789,
  messageId: number = 1
): any {
  return {
    update_id: Date.now(),
    message: {
      message_id: messageId,
      from: {
        id: fromId,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser'
      },
      chat: {
        id: chatId,
        type: 'private',
        first_name: 'Test',
        username: 'testuser'
      },
      date: Math.floor(Date.now() / 1000),
      text
    }
  }
}

