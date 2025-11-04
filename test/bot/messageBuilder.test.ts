import { describe, expect, it } from 'vitest'
import OpenAI from 'openai'
import {
  composeUserContent,
  createUserMessage,
  createLoggedMessage,
  filterResponseMessages,
  extractMemoryItems
} from '../../src/bot/messageBuilder'

describe('messageBuilder', () => {
  describe('composeUserContent', () => {
    it('returns input_text with username + text when trimmedMessage present', () => {
      const res = composeUserContent({
        username: 'alice',
        trimmedMessage: 'hello',
        imageInputs: []
      })

      expect(res).toEqual([
        { type: 'input_text', text: 'пользователь alice отправил стикер, далее описание: hello' }
      ])
    })

    it('uses default text when only images are present and no text', () => {
      const imageInputs: OpenAI.Responses.ResponseInputImage[] = [
        {
          type: 'input_image',
          image_url: 'data:image/png;base64,AAA'
        }
      ]

      const res = composeUserContent({
        username: 'bob',
        trimmedMessage: '',
        imageInputs
      })

      expect(res[0]).toEqual({ type: 'input_text', text: 'bob отправил изображение' })
      expect(res[1]).toEqual(imageInputs[0])
    })

    it('appends image inputs after text when both present', () => {
      const imageInputs: OpenAI.Responses.ResponseInputImage[] = [
        {
          type: 'input_image',
          image_url: 'data:image/png;base64,BBB'
        }
      ]

      const res = composeUserContent({
        username: 'chris',
        trimmedMessage: 'see this',
        imageInputs
      })

      expect(res[0]).toEqual({ type: 'input_text', text: 'пользователь chris отправил стикер, далее описание: see this' })
      expect(res[1]).toEqual(imageInputs[0])
    })

    it('falls back to input_text with username and empty string when nothing provided', () => {
      const res = composeUserContent({
        username: 'dana',
        trimmedMessage: '',
        imageInputs: []
      })

      expect(res).toEqual([
        { type: 'input_text', text: 'пользователь dana отправил изображение, далее описание: ' }
      ])
    })
  })

  describe('createUserMessage', () => {
    it('wraps content into a user message', () => {
      const content: OpenAI.Responses.ResponseInputMessageContentList = [
        { type: 'input_text', text: 'eve: hi' }
      ]
      const msg = createUserMessage(content)
      expect(msg).toEqual({ role: 'user', content })
    })
  })

  describe('createLoggedMessage', () => {
    it('redacts image_url values while preserving other content', () => {
      const original = createUserMessage([
        { type: 'input_text', text: 'frank: pic below' },
        { type: 'input_image', image_url: 'data:image/png;base64,SECRET' }
      ])

      const logged = createLoggedMessage(original)

      expect(logged.role).toBe('user')
      expect(logged.content[0]).toEqual({ type: 'input_text', text: 'frank: pic below' })
      expect(logged.content[1]).toEqual({ type: 'input_image', image_url: '[data-url omitted]' })
    })
  })

  describe('filterResponseMessages', () => {
    it('filters out memory items', () => {
      const arr = [
        { type: 'text', content: 'hello' },
        { type: 'memory', content: 'remember this' },
        { type: 'emoji', content: '👍' },
        { type: 'memory', content: 'and this' }
      ] as any

      const res = filterResponseMessages(arr)
      expect(res).toEqual([
        { type: 'text', content: 'hello' },
        { type: 'emoji', content: '👍' }
      ])
    })
  })

  describe('extractMemoryItems', () => {
    it('returns only memory items', () => {
      const arr = [
        { type: 'text', content: 'hello' },
        { type: 'memory', content: 'remember this' },
        { type: 'emoji', content: '👍' },
        { type: 'memory', content: 'and this' }
      ] as any

      const res = extractMemoryItems(arr)
      expect(res).toEqual([
        { type: 'memory', content: 'remember this' },
        { type: 'memory', content: 'and this' }
      ])
    })
  })
})
