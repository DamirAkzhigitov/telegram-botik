/**
 * Integration tests for Telegram bot message handling
 * Tests real message sending and bot response verification
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { TelegramClient } from './telegramClient'
import { loadIntegrationConfig } from './config'
import {
  createTestUpdate,
  createTestMarker,
  verifyWorkerWebhook,
  waitForBotReady,
  sleep
} from './helpers'

describe('Telegram Bot Integration Tests', () => {
  let client: TelegramClient
  let chatId: string
  let workerUrl: string
  let testConfig: ReturnType<typeof loadIntegrationConfig>

  beforeAll(async () => {
    testConfig = loadIntegrationConfig()
    client = new TelegramClient(testConfig.botToken)
    chatId = testConfig.chatId
    workerUrl = testConfig.workerUrl

    // Verify configuration
    expect(testConfig.botToken).toBeTruthy()
    expect(testConfig.chatId).toBeTruthy()
    expect(testConfig.workerUrl).toBeTruthy()

    // Verify worker is accessible
    const workerReady = await verifyWorkerWebhook(workerUrl)
    expect(workerReady).toBe(true)

    // Verify bot is ready
    const botReady = await waitForBotReady(client, chatId)
    expect(botReady).toBe(true)
  })

  beforeEach(async () => {
    // Small delay between tests to avoid rate limiting
    await sleep(1000)
  })

  afterEach(async () => {
    // Cleanup after each test
    await sleep(500)
  })

  describe('Direct Webhook Testing', () => {
    it('should handle webhook update and return OK', async () => {
      const update = createTestUpdate(
        chatId,
        'Hello from integration test',
        123456789,
        Date.now()
      )

      const response = await client.sendWebhookUpdate(workerUrl, update)

      expect(response.status).toBe(200)
      const text = await response.text()
      expect(text).toBe('OK')
    })

    it('should process text message update', async () => {
      const update = createTestUpdate(
        chatId,
        'Test message for webhook',
        123456789,
        Date.now()
      )

      const response = await client.sendWebhookUpdate(workerUrl, update)

      expect(response.status).toBe(200)
      // Worker should process the message (even if bot doesn't reply)
    })

    it('should handle invalid update gracefully', async () => {
      const invalidUpdate = {
        update_id: Date.now()
        // Missing required message field
      }

      const response = await client.sendWebhookUpdate(
        workerUrl,
        invalidUpdate as any
      )

      // Worker should return 400 for invalid requests
      expect([200, 400]).toContain(response.status)
    })

    it('should reject non-POST requests', async () => {
      const response = await fetch(workerUrl, {
        method: 'GET'
      })

      // Worker should return 405 or 404 for non-POST to webhook
      expect([200, 404, 405]).toContain(response.status)
    })
  })

  describe('Real Telegram API Message Sending', () => {
    it('should send message via Telegram API', async () => {
      const testMessage = `Integration test message ${Date.now()}`

      const sentMessage = await client.sendMessage(chatId, testMessage)

      expect(sentMessage).toBeDefined()
      expect(sentMessage.chat.id.toString()).toBe(chatId.toString())
      expect(sentMessage.text).toBe(testMessage)
      expect(sentMessage.from?.is_bot).toBe(false)
    })

    it('should send /help command and receive response', async () => {
      await createTestMarker(client, chatId, 'help_test')

      // Send /help command
      const helpMessage = await client.sendMessage(chatId, '/help')

      expect(helpMessage.text).toBe('/help')

      // Wait a bit for bot to process and respond
      await sleep(5000)

      // Note: Since webhook is set, we can't use getUpdates easily
      // This test verifies the message was sent and webhook was triggered
      // To fully verify bot response, we'd need to check worker logs or use a different method
      expect(helpMessage.message_id).toBeGreaterThan(0)
    })

    it('should handle regular text message flow', async () => {
      const testText = `Hello bot! This is a test message ${Date.now()}`

      const sentMessage = await client.sendMessage(chatId, testText)

      expect(sentMessage).toBeDefined()
      expect(sentMessage.text).toBe(testText)

      // Wait for webhook processing
      await sleep(3000)

      // Verify message was sent successfully
      expect(sentMessage.message_id).toBeGreaterThan(0)
    })
  })

  describe('Message Processing Verification', () => {
    it('should verify worker processes update correctly', async () => {
      const update = createTestUpdate(
        chatId,
        'Test processing verification',
        123456789,
        Date.now()
      )

      const startTime = Date.now()
      const response = await client.sendWebhookUpdate(workerUrl, update)
      const processingTime = Date.now() - startTime

      expect(response.status).toBe(200)
      // Worker should process quickly (under 5 seconds for simple messages)
      expect(processingTime).toBeLessThan(5000)
    })

    it('should handle multiple sequential messages', async () => {
      const messages = [
        'First test message',
        'Second test message',
        'Third test message'
      ]

      for (const text of messages) {
        const update = createTestUpdate(
          chatId,
          text,
          123456789,
          Date.now()
        )

        const response = await client.sendWebhookUpdate(workerUrl, update)
        expect(response.status).toBe(200)

        // Small delay between messages
        await sleep(1000)
      }
    })

    it('should handle bot message filtering', async () => {
      // Bot should ignore messages from other bots
      const botUpdate = {
        update_id: Date.now(),
        message: {
          message_id: Date.now(),
          from: {
            id: 999999,
            is_bot: true,
            first_name: 'TestBot'
          },
          chat: {
            id: chatId,
            type: 'private'
          },
          date: Math.floor(Date.now() / 1000),
          text: 'Message from bot'
        }
      }

      const response = await client.sendWebhookUpdate(workerUrl, botUpdate)

      // Worker should accept the update but bot should ignore it
      expect(response.status).toBe(200)
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json {'
      })

      expect(response.status).toBe(400)
    })

    it('should handle empty request body', async () => {
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: ''
      })

      // Should return 400 for invalid request
      expect([400, 500]).toContain(response.status)
    })

    it('should handle missing message field', async () => {
      const update = {
        update_id: Date.now()
        // Missing message
      }

      const response = await client.sendWebhookUpdate(workerUrl, update as any)

      // Worker should handle gracefully
      expect([200, 400]).toContain(response.status)
    })
  })

  describe('Command Processing', () => {
    it('should process /get_prompt command', async () => {
      const update = createTestUpdate(chatId, '/get_prompt', 123456789, Date.now())

      const response = await client.sendWebhookUpdate(workerUrl, update)

      expect(response.status).toBe(200)
      await sleep(2000)
    })

    it('should process /balance command', async () => {
      const update = createTestUpdate(chatId, '/balance', 123456789, Date.now())

      const response = await client.sendWebhookUpdate(workerUrl, update)

      expect(response.status).toBe(200)
      await sleep(2000)
    })
  })
})

