import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MessageBufferService } from '../../src/service/MessageBufferService'
import type { QueuedMessageItem } from '../../src/types'

describe('MessageBufferService', () => {
  let mockEnv: Env
  let mockStorage: KVNamespace<string>
  let mockQueue: Queue
  let bufferService: MessageBufferService

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    mockStorage = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn()
    } as any

    mockQueue = {
      send: vi.fn()
    } as any

    mockEnv = {
      CHAT_SESSIONS_STORAGE: mockStorage,
      MESSAGE_QUEUE: mockQueue
    } as Env

    bufferService = new MessageBufferService(mockEnv)
  })

  describe('bufferMessage', () => {
    const chatId = 123
    const messageItem: QueuedMessageItem = {
      username: 'testuser',
      content: 'test message',
      timestamp: Date.now(),
      messageId: 1,
      userId: 456
    }

    it('should create new buffer and schedule flush trigger when no existing buffer', async () => {
      vi.mocked(mockStorage.get).mockResolvedValue(null)
      vi.mocked(mockQueue.send).mockResolvedValue(undefined)

      await bufferService.bufferMessage(chatId, messageItem, 10)

      expect(mockStorage.get).toHaveBeenCalledWith('buffer_123')
      expect(mockStorage.put).toHaveBeenCalledWith(
        'buffer_123',
        expect.stringContaining('testuser')
      )
      // Should schedule a flush trigger (empty messages array with delay)
      expect(mockQueue.send).toHaveBeenCalledWith(
        { chatId: 123, messages: [] },
        expect.objectContaining({ delaySeconds: expect.any(Number) })
      )
    })

    it('should add to existing buffer and schedule flush trigger when buffer exists and not full', async () => {
      const existingBuffer = {
        messages: [
          {
            username: 'user1',
            content: 'first message',
            timestamp: Date.now() - 1000,
            messageId: 1,
            userId: 1
          }
        ],
        lastMessageTimestamp: Date.now() - 1000,
        scheduledFlushTime: null
      }

      vi.mocked(mockStorage.get).mockResolvedValue(JSON.stringify(existingBuffer))
      vi.mocked(mockQueue.send).mockResolvedValue(undefined)

      await bufferService.bufferMessage(chatId, messageItem, 10)

      expect(mockStorage.put).toHaveBeenCalledWith(
        'buffer_123',
        expect.stringContaining('testuser')
      )
      // Should schedule a flush trigger (empty messages array with delay)
      expect(mockQueue.send).toHaveBeenCalledWith(
        { chatId: 123, messages: [] },
        expect.objectContaining({ delaySeconds: expect.any(Number) })
      )
    })

    it('should flush buffer immediately when batch limit is reached', async () => {
      const existingMessages = Array.from({ length: 9 }, (_, i) => ({
        username: `user${i}`,
        content: `message ${i}`,
        timestamp: Date.now() - 1000,
        messageId: i + 1,
        userId: i + 1
      }))

      const existingBuffer = {
        messages: existingMessages,
        lastMessageTimestamp: Date.now() - 1000,
        scheduledFlushTime: null
      }

      vi.mocked(mockStorage.get).mockResolvedValue(JSON.stringify(existingBuffer))
      vi.mocked(mockQueue.send).mockResolvedValue(undefined)

      await bufferService.bufferMessage(chatId, messageItem, 10)

      // Should flush immediately (no delay) when batch limit reached
      expect(mockQueue.send).toHaveBeenCalledWith({
        chatId: 123,
        messages: expect.arrayContaining([
          expect.objectContaining({ username: 'user0' }),
          expect.objectContaining({ username: 'testuser' })
        ])
      })
      expect(mockStorage.delete).toHaveBeenCalledWith('buffer_123')
    })

    it('should flush buffer immediately when 10 seconds have passed', async () => {
      const now = Date.now()
      const existingBuffer = {
        messages: [
          {
            username: 'user1',
            content: 'first message',
            timestamp: now - 11000, // 11 seconds ago
            messageId: 1,
            userId: 1
          }
        ],
        lastMessageTimestamp: now - 11000, // 11 seconds ago (exceeds 10s timeout)
        scheduledFlushTime: null
      }

      vi.mocked(mockStorage.get).mockResolvedValue(JSON.stringify(existingBuffer))
      vi.mocked(mockQueue.send).mockResolvedValue(undefined)

      await bufferService.bufferMessage(chatId, messageItem, 10)

      // Should flush immediately (no delay) when 10 seconds have passed
      expect(mockQueue.send).toHaveBeenCalledWith({
        chatId: 123,
        messages: expect.arrayContaining([
          expect.objectContaining({ username: 'user1' }),
          expect.objectContaining({ username: 'testuser' })
        ])
      })
      expect(mockStorage.delete).toHaveBeenCalledWith('buffer_123')
    })

    it('should schedule flush trigger when timeout has not expired', async () => {
      const now = Date.now()
      const existingBuffer = {
        messages: [
          {
            username: 'user1',
            content: 'first message',
            timestamp: now - 3000, // 3 seconds ago
            messageId: 1,
            userId: 1
          }
        ],
        lastMessageTimestamp: now - 3000, // 3 seconds ago (less than 10s timeout)
        scheduledFlushTime: null
      }

      vi.mocked(mockStorage.get).mockResolvedValue(JSON.stringify(existingBuffer))
      vi.mocked(mockQueue.send).mockResolvedValue(undefined)

      await bufferService.bufferMessage(chatId, messageItem, 10)

      // Should schedule a flush trigger with delay (7 seconds remaining)
      expect(mockQueue.send).toHaveBeenCalledWith(
        { chatId: 123, messages: [] },
        expect.objectContaining({ delaySeconds: 7 })
      )
      // Should not flush messages immediately
      expect(mockQueue.send).not.toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ username: 'user1' })
          ])
        }),
        expect.not.objectContaining({ delaySeconds: expect.anything() })
      )
    })

    it('should handle storage errors gracefully', async () => {
      vi.mocked(mockStorage.get).mockRejectedValue(new Error('Storage error'))

      await expect(
        bufferService.bufferMessage(chatId, messageItem, 10)
      ).resolves.not.toThrow()
    })

    it('should handle queue send errors when flushing immediately', async () => {
      const existingMessages = Array.from({ length: 9 }, (_, i) => ({
        username: `user${i}`,
        content: `message ${i}`,
        timestamp: Date.now() - 1000,
        messageId: i + 1,
        userId: i + 1
      }))

      const existingBuffer = {
        messages: existingMessages,
        lastMessageTimestamp: Date.now() - 1000,
        scheduledFlushTime: null
      }

      vi.mocked(mockStorage.get).mockResolvedValue(JSON.stringify(existingBuffer))
      vi.mocked(mockQueue.send).mockRejectedValue(new Error('Queue error'))

      await expect(
        bufferService.bufferMessage(chatId, messageItem, 10)
      ).rejects.toThrow('Queue error')
    })

    it('should handle queue send errors when scheduling flush trigger', async () => {
      const existingBuffer = {
        messages: [
          {
            username: 'user1',
            content: 'first message',
            timestamp: Date.now() - 3000,
            messageId: 1,
            userId: 1
          }
        ],
        lastMessageTimestamp: Date.now() - 3000,
        scheduledFlushTime: null
      }

      vi.mocked(mockStorage.get).mockResolvedValue(JSON.stringify(existingBuffer))
      vi.mocked(mockQueue.send).mockRejectedValue(new Error('Queue error'))

      await expect(
        bufferService.bufferMessage(chatId, messageItem, 10)
      ).rejects.toThrow('Queue error')
    })
  })

  describe('flushBuffer', () => {
    const chatId = 123

    it('should enqueue and clear buffer when buffer exists', async () => {
      const buffer = {
        messages: [
          {
            username: 'user1',
            content: 'message 1',
            timestamp: Date.now(),
            messageId: 1,
            userId: 1
          }
        ],
        lastMessageTimestamp: Date.now(),
        scheduledFlushTime: null
      }

      vi.mocked(mockStorage.get).mockResolvedValue(JSON.stringify(buffer))
      vi.mocked(mockQueue.send).mockResolvedValue(undefined)

      await bufferService.flushBuffer(chatId)

      expect(mockQueue.send).toHaveBeenCalledWith({
        chatId: 123,
        messages: buffer.messages
      })
      expect(mockStorage.delete).toHaveBeenCalledWith('buffer_123')
    })

    it('should do nothing when buffer does not exist', async () => {
      vi.mocked(mockStorage.get).mockResolvedValue(null)

      await bufferService.flushBuffer(chatId)

      expect(mockQueue.send).not.toHaveBeenCalled()
      expect(mockStorage.delete).not.toHaveBeenCalled()
    })

    it('should do nothing when buffer is empty', async () => {
      const buffer = {
        messages: [],
        lastMessageTimestamp: Date.now(),
        scheduledFlushTime: null
      }

      vi.mocked(mockStorage.get).mockResolvedValue(JSON.stringify(buffer))

      await bufferService.flushBuffer(chatId)

      expect(mockQueue.send).not.toHaveBeenCalled()
      // When buffer is empty, it should not delete (only delete if messages exist)
      expect(mockStorage.delete).not.toHaveBeenCalled()
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(mockStorage.get).mockRejectedValue(new Error('Storage error'))

      await expect(bufferService.flushBuffer(chatId)).resolves.not.toThrow()
    })
  })
})
