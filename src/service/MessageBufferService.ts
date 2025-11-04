import type { QueuedMessage, QueuedMessageItem } from '../types'

export const DEBOUNCE_TIMEOUT_MS = 10000 // 10 seconds

interface MessageBuffer {
  messages: QueuedMessageItem[]
  lastMessageTimestamp: number
  scheduledFlushTime: number | null // timestamp when flush is scheduled
}

export class MessageBufferService {
  private env: Env

  constructor(env: Env) {
    this.env = env
  }

  private getBufferKey(chatId: number): string {
    return `buffer_${chatId}`
  }

  async getBuffer(chatId: number): Promise<MessageBuffer | null> {
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

  async clearBuffer(chatId: number): Promise<void> {
    try {
      await this.env.CHAT_SESSIONS_STORAGE.delete(this.getBufferKey(chatId))
    } catch (error) {
      console.error('Error clearing buffer:', error)
    }
  }

  async enqueueMessages(
    chatId: number,
    messages: QueuedMessageItem[],
    delaySeconds?: number
  ): Promise<void> {
    const queuedMessage: QueuedMessage = {
      chatId,
      messages
    }
    try {
      const options = delaySeconds ? { delaySeconds } : undefined
      await this.env.MESSAGE_QUEUE.send(queuedMessage, options)
      console.log(
        `Enqueued ${messages.length} messages for chat ${chatId}${
          delaySeconds ? ` (delayed by ${delaySeconds}s)` : ''
        }`
      )
    } catch (error) {
      console.error('Error enqueuing messages:', error)
      throw error
    }
  }

  private async scheduleFlush(chatId: number): Promise<void> {
    const buffer = await this.getBuffer(chatId)
    if (!buffer || buffer.messages.length === 0) {
      return
    }

    const now = Date.now()
    const timeSinceLastMessage = now - buffer.lastMessageTimestamp

    // If 10 seconds have already passed, flush immediately
    if (timeSinceLastMessage >= DEBOUNCE_TIMEOUT_MS) {
      await this.enqueueMessages(chatId, buffer.messages)
      await this.clearBuffer(chatId)
      return
    }

    // Note: We don't check for existing scheduled flushes here because:
    // 1. We can't cancel queued messages in Cloudflare Queues
    // 2. When a new message arrives, we reset scheduledFlushTime to null
    // 3. Old flush triggers will be ignored when they arrive if new messages came in
    // So we always schedule a new flush when this method is called

    // Calculate remaining time until flush
    const remainingTime = DEBOUNCE_TIMEOUT_MS - timeSinceLastMessage
    const delaySeconds = Math.ceil(remainingTime / 1000)

    // Schedule flush with delay - send a flush trigger message (empty messages array)
    // When it arrives, the queue processor will check if 10 seconds have passed
    buffer.scheduledFlushTime = now + remainingTime
    await this.saveBuffer(chatId, buffer)

    // Send a flush trigger message (with empty messages array) that will check and flush
    const flushTrigger: QueuedMessage = {
      chatId,
      messages: [] // Empty array signals this is a flush trigger
    }
    try {
      await this.env.MESSAGE_QUEUE.send(flushTrigger, { delaySeconds })
      console.log(
        `Scheduled flush trigger for chat ${chatId} in ${delaySeconds}s`
      )
    } catch (error) {
      console.error('Error scheduling flush trigger:', error)
      // Clear the scheduled flush time on error
      buffer.scheduledFlushTime = null
      await this.saveBuffer(chatId, buffer)
    }
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
      // Add to existing buffer and update last message timestamp
      // This resets the debounce timer
      buffer = {
        messages: [...existingBuffer.messages, message],
        lastMessageTimestamp: now,
        scheduledFlushTime: null // Reset scheduled flush since we got a new message
      }
    } else {
      // Create new buffer
      buffer = {
        messages: [message],
        lastMessageTimestamp: now,
        scheduledFlushTime: null
      }
    }

    // Check if batch limit reached - flush immediately
    if (buffer.messages.length >= batchLimit) {
      await this.enqueueMessages(chatId, buffer.messages)
      await this.clearBuffer(chatId)
      return
    }

    // Save updated buffer and schedule flush
    await this.saveBuffer(chatId, buffer)
    await this.scheduleFlush(chatId)
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
