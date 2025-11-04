import type { QueuedMessage, QueuedMessageItem } from '../types'

const DEBOUNCE_TIMEOUT_MS = 5000 // 5 seconds

interface MessageBuffer {
  messages: QueuedMessageItem[]
  firstMessageTimestamp: number
}

export class MessageBufferService {
  private env: Env

  constructor(env: Env) {
    this.env = env
  }

  private getBufferKey(chatId: number): string {
    return `buffer_${chatId}`
  }

  private async getBuffer(chatId: number): Promise<MessageBuffer | null> {
    try {
      const data = await this.env.CHAT_SESSIONS_STORAGE.get(
        this.getBufferKey(chatId)
      )
      if (!data) return null
      return JSON.parse(data) as MessageBuffer
    } catch (error) {
      console.error('Error getting buffer:', error)
      return null
    }
  }

  private async saveBuffer(
    chatId: number,
    buffer: MessageBuffer
  ): Promise<void> {
    try {
      await this.env.CHAT_SESSIONS_STORAGE.put(
        this.getBufferKey(chatId),
        JSON.stringify(buffer)
      )
    } catch (error) {
      console.error('Error saving buffer:', error)
    }
  }

  private async clearBuffer(chatId: number): Promise<void> {
    try {
      await this.env.CHAT_SESSIONS_STORAGE.delete(this.getBufferKey(chatId))
    } catch (error) {
      console.error('Error clearing buffer:', error)
    }
  }

  private async enqueueMessages(
    chatId: number,
    messages: QueuedMessageItem[]
  ): Promise<void> {
    const queuedMessage: QueuedMessage = {
      chatId,
      messages
    }
    try {
      await this.env.MESSAGE_QUEUE.send(queuedMessage)
      console.log(`Enqueued ${messages.length} messages for chat ${chatId}`)
    } catch (error) {
      console.error('Error enqueuing messages:', error)
      throw error
    }
  }

  private shouldFlushBuffer(
    buffer: MessageBuffer,
    batchLimit: number
  ): boolean {
    const now = Date.now()
    const timeSinceFirstMessage = now - buffer.firstMessageTimestamp

    // Flush if timeout expired
    if (timeSinceFirstMessage >= DEBOUNCE_TIMEOUT_MS) {
      return true
    }

    // Flush if batch limit reached
    if (buffer.messages.length >= batchLimit) {
      return true
    }

    return false
  }

  async bufferMessage(
    chatId: number,
    message: QueuedMessageItem,
    batchLimit: number
  ): Promise<void> {
    const existingBuffer = await this.getBuffer(chatId)
    const now = Date.now()

    let buffer: MessageBuffer
    if (existingBuffer) {
      // Add to existing buffer
      buffer = {
        messages: [...existingBuffer.messages, message],
        firstMessageTimestamp: existingBuffer.firstMessageTimestamp
      }
    } else {
      // Create new buffer
      buffer = {
        messages: [message],
        firstMessageTimestamp: now
      }
    }

    // Check if we should flush
    if (this.shouldFlushBuffer(buffer, batchLimit)) {
      // Enqueue all messages and clear buffer
      await this.enqueueMessages(chatId, buffer.messages)
      await this.clearBuffer(chatId)
    } else {
      // Save updated buffer
      await this.saveBuffer(chatId, buffer)
    }
  }

  /**
   * Force flush any pending messages for a chat
   * Useful for cleanup or manual flushing
   */
  async flushBuffer(chatId: number): Promise<void> {
    const buffer = await this.getBuffer(chatId)
    if (buffer && buffer.messages.length > 0) {
      await this.enqueueMessages(chatId, buffer.messages)
      await this.clearBuffer(chatId)
    }
  }
}
