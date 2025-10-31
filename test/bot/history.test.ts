import { describe, expect, it } from 'vitest'
import OpenAI from 'openai'
import {
  sanitizeHistoryMessages,
  buildAssistantHistoryMessages
} from '../../src/bot/history'
import type { MessagesArray, SessionData } from '../../src/types'
import { IMAGE_PLACEHOLDER_TEXT } from '../../src/bot/constants'

describe('history', () => {
  describe('sanitizeHistoryMessages', () => {
    it('should replace input_image with placeholder text in user messages', () => {
      const messages: SessionData['userMessages'] = [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'hello' },
            { type: 'input_image', image_url: 'data:image/png;base64,AAA' }
          ]
        } as OpenAI.Responses.ResponseInputItem.Message
      ]

      const result = sanitizeHistoryMessages(messages)

      expect(result).toHaveLength(1)
      expect(result[0].role).toBe('user')
      const userMsg = result[0] as OpenAI.Responses.ResponseInputItem.Message
      expect(userMsg.content).toHaveLength(2)
      expect(userMsg.content[0]).toEqual({ type: 'input_text', text: 'hello' })
      expect(userMsg.content[1]).toEqual({
        type: 'input_text',
        text: IMAGE_PLACEHOLDER_TEXT
      })
    })

    it('should leave non-user messages unchanged', () => {
      const messages: SessionData['userMessages'] = [
        {
          role: 'assistant',
          content: [{ type: 'output_text', text: 'response' }]
        } as OpenAI.Responses.ResponseOutputMessage,
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'hello' }]
        } as OpenAI.Responses.ResponseInputItem.Message
      ]

      const result = sanitizeHistoryMessages(messages)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual(messages[0])
      expect(result[1].role).toBe('user')
    })

    it('should handle user messages with only text content', () => {
      const messages: SessionData['userMessages'] = [
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'just text' }]
        } as OpenAI.Responses.ResponseInputItem.Message
      ]

      const result = sanitizeHistoryMessages(messages)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(messages[0])
    })

    it('should replace multiple input_image items with placeholder text', () => {
      const messages: SessionData['userMessages'] = [
        {
          role: 'user',
          content: [
            { type: 'input_image', image_url: 'data:image/png;base64,AAA' },
            { type: 'input_text', text: 'middle text' },
            { type: 'input_image', image_url: 'data:image/png;base64,BBB' }
          ]
        } as OpenAI.Responses.ResponseInputItem.Message
      ]

      const result = sanitizeHistoryMessages(messages)

      expect(result).toHaveLength(1)
      const userMsg = result[0] as OpenAI.Responses.ResponseInputItem.Message
      expect(userMsg.content[0]).toEqual({
        type: 'input_text',
        text: IMAGE_PLACEHOLDER_TEXT
      })
      expect(userMsg.content[1]).toEqual({
        type: 'input_text',
        text: 'middle text'
      })
      expect(userMsg.content[2]).toEqual({
        type: 'input_text',
        text: IMAGE_PLACEHOLDER_TEXT
      })
    })

    it('should handle empty messages array', () => {
      const messages: SessionData['userMessages'] = []

      const result = sanitizeHistoryMessages(messages)

      expect(result).toEqual([])
    })

    it('should handle user message with only image inputs', () => {
      const messages: SessionData['userMessages'] = [
        {
          role: 'user',
          content: [
            { type: 'input_image', image_url: 'data:image/png;base64,AAA' }
          ]
        } as OpenAI.Responses.ResponseInputItem.Message
      ]

      const result = sanitizeHistoryMessages(messages)

      expect(result).toHaveLength(1)
      const userMsg = result[0] as OpenAI.Responses.ResponseInputItem.Message
      expect(userMsg.content[0]).toEqual({
        type: 'input_text',
        text: IMAGE_PLACEHOLDER_TEXT
      })
    })
  })

  describe('buildAssistantHistoryMessages', () => {
    it('should convert text message to assistant format', () => {
      const botMessages: MessagesArray = [
        { type: 'text', content: 'Hello there' }
      ]

      const result = buildAssistantHistoryMessages(botMessages)

      expect(result).toHaveLength(1)
      expect(result[0].role).toBe('assistant')
      expect(result[0].content).toEqual([
        { type: 'output_text', text: 'Hello there' }
      ])
    })

    it('should convert image message to assistant format with "image" text', () => {
      const botMessages: MessagesArray = [
        { type: 'image', content: 'https://example.com/image.png' }
      ]

      const result = buildAssistantHistoryMessages(botMessages)

      expect(result).toHaveLength(1)
      expect(result[0].role).toBe('assistant')
      expect(result[0].content).toEqual([
        { type: 'output_text', text: 'image' }
      ])
    })

    it('should handle multiple messages', () => {
      const botMessages: MessagesArray = [
        { type: 'text', content: 'First message' },
        { type: 'image', content: 'https://example.com/img.png' },
        { type: 'text', content: 'Second text' }
      ]

      const result = buildAssistantHistoryMessages(botMessages)

      expect(result).toHaveLength(3)
      expect(result[0].content).toEqual([
        { type: 'output_text', text: 'First message' }
      ])
      expect(result[1].content).toEqual([
        { type: 'output_text', text: 'image' }
      ])
      expect(result[2].content).toEqual([
        { type: 'output_text', text: 'Second text' }
      ])
    })

    it('should handle empty messages array', () => {
      const botMessages: MessagesArray = []

      const result = buildAssistantHistoryMessages(botMessages)

      expect(result).toEqual([])
    })

    it('should handle emoji messages', () => {
      const botMessages: MessagesArray = [
        { type: 'emoji', content: '👍' }
      ]

      const result = buildAssistantHistoryMessages(botMessages)

      expect(result).toHaveLength(1)
      expect(result[0].role).toBe('assistant')
      expect(result[0].content).toEqual([
        { type: 'output_text', text: '👍' }
      ])
    })

    it('should handle mixed message types', () => {
      const botMessages: MessagesArray = [
        { type: 'text', content: 'Text' },
        { type: 'emoji', content: '😀' },
        { type: 'image', content: 'url' }
      ]

      const result = buildAssistantHistoryMessages(botMessages)

      expect(result).toHaveLength(3)
      expect(result[0].content[0].text).toBe('Text')
      expect(result[1].content[0].text).toBe('😀')
      expect(result[2].content[0].text).toBe('image')
    })
  })
})

