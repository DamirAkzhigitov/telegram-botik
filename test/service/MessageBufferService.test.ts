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

    it('should create new buffer and save when no existing buffer', async () => {
      vi.mocked(mockStorage.get).mockResolvedValue(null)

      await bufferService.bufferMessage(chatId, messageItem, 10)

      expect(mockStorage.get).toHaveBeenCalledWith('buffer_123')
      expect(mockStorage.put).toHaveBeenCalledWith(
        'buffer_123',
        expect.stringContaining('testuser')
      )
      expect(mockQueue.send).not.toHaveBeenCalled()
    })

    it('should add to existing buffer when buffer exists and not full', async () => {
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
        firstMessageTimestamp: Date.now() - 1000
      }

      vi.mocked(mockStorage.get).mockResolvedValue(JSON.stringify(existingBuffer))

      await bufferService.bufferMessage(chatId, messageItem, 10)

      expect(mockStorage.put).toHaveBeenCalledWith(
        'buffer_123',
        expect.stringContaining('testuser')
      )
      expect(mockQueue.send).not.toHaveBeenCalled()
    })

    it('should flush buffer when batch limit is reached', async () => {
      const existingMessages = Array.from({ length: 9 }, (_, i) => ({
        username: `user${i}`,
        content: `message ${i}`,
        timestamp: Date.now() - 1000,
        messageId: i + 1,
        userId: i + 1
      }))

      const existingBuffer = {
        messages: existingMessages,
        firstMessageTimestamp: Date.now() - 1000
      }

      vi.mocked(mockStorage.get).mockResolvedValue(JSON.stringify(existingBuffer))
      vi.mocked(mockQueue.send).mockResolvedValue(undefined)

      await bufferService.bufferMessage(chatId, messageItem, 10)

      expect(mockQueue.send).toHaveBeenCalledWith({
        chatId: 123,
        messages: expect.arrayContaining([
          expect.objectContaining({ username: 'user0' }),
          expect.objectContaining({ username: 'testuser' })
        ])
      })
      expect(mockStorage.delete).toHaveBeenCalledWith('buffer_123')
    })

    it('should flush buffer when timeout expires', async () => {
      const existingBuffer = {
        messages: [
          {
            username: 'user1',
            content: 'first message',
            timestamp: Date.now() - 6000, // 6 seconds ago
            messageId: 1,
            userId: 1
          }
        ],
        firstMessageTimestamp: Date.now() - 6000 // 6 seconds ago (exceeds 5s timeout)
      }

      vi.mocked(mockStorage.get).mockResolvedValue(JSON.stringify(existingBuffer))
      vi.mocked(mockQueue.send).mockResolvedValue(undefined)

      await bufferService.bufferMessage(chatId, messageItem, 10)

      expect(mockQueue.send).toHaveBeenCalledWith({
        chatId: 123,
        messages: expect.arrayContaining([
          expect.objectContaining({ username: 'user1' }),
          expect.objectContaining({ username: 'testuser' })
        ])
      })
      expect(mockStorage.delete).toHaveBeenCalledWith('buffer_123')
    })

    it('should handle storage errors gracefully', async () => {
      vi.mocked(mockStorage.get).mockRejectedValue(new Error('Storage error'))

      await expect(
        bufferService.bufferMessage(chatId, messageItem, 10)
      ).resolves.not.toThrow()
    })

    it('should handle queue send errors', async () => {
      const existingBuffer = {
        messages: Array.from({ length: 9 }, (_, i) => ({
          username: `user${i}`,
          content: `message ${i}`,
          timestamp: Date.now() - 1000,
          messageId: i + 1,
          userId: i + 1
        })),
        firstMessageTimestamp: Date.now() - 1000
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
        firstMessageTimestamp: Date.now()
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
        firstMessageTimestamp: Date.now()
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
