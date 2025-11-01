import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Context } from 'telegraf'
import { dispatchResponsesSequentially } from '../../src/bot/responseDispatcher'
import type { SessionData, Sticker } from '../../src/types'
import type { UserService } from '../../src/service/UserService'

// Mock utils
vi.mock('../../src/utils', () => ({
  base64ToBlob: vi.fn((b64: string, type: string) => {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type })
  }),
  findByEmoji: vi.fn((stickers: Sticker[], emoji: string) => {
    return (
      stickers.find((sticker) => sticker.emoji === emoji) ||
      stickers[0] ||
      ({ emoji: undefined, file_id: 'default_file_id', set_name: 'default' } as Sticker)
    )
  }),
  getRandomValueArr: vi.fn((arr: any[]) => {
    return arr[Math.floor(Math.random() * arr.length)]
  })
}))

describe('responseDispatcher', () => {
  let mockCtx: Partial<Context>
  let mockUserService: Partial<UserService>
  let mockEnv: Env
  let mockSessionData: SessionData
  let mockTelegram: any
  let originalFetch: typeof fetch

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock fetch
    originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({})
    } as Response)

    // Mock Telegram API
    mockTelegram = {
      getStickerSet: vi.fn(),
      sendSticker: vi.fn(),
      sendMessage: vi.fn(),
      setMessageReaction: vi.fn()
    }

    mockCtx = {
      chat: {
        id: 12345
      },
      from: {
        id: 67890
      },
      message: {
        message_id: 111
      },
      telegram: mockTelegram
    }

    mockUserService = {
      deductCoins: vi.fn().mockResolvedValue(true)
    }

    mockEnv = {
      BOT_TOKEN: 'test-bot-token'
    } as Env

    mockSessionData = {
      stickersPacks: ['test_sticker_set'],
      chat_settings: {
        send_message_option: {}
      },
      userMessages: [],
      prompt: '',
      firstTime: false,
      promptNotSet: true,
      stickerNotSet: true,
      toggle_history: false
    }
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('dispatchResponsesSequentially', () => {
    it('should return early if ctx.chat is undefined', async () => {
      const ctxWithoutChat = { ...mockCtx, chat: undefined }

      await dispatchResponsesSequentially(
        [{ type: 'text', content: 'test' }],
        {
          ctx: ctxWithoutChat as Context,
          sessionData: mockSessionData,
          userService: mockUserService as UserService,
          env: mockEnv
        }
      )

      expect(mockTelegram.sendMessage).not.toHaveBeenCalled()
    })

    it('should dispatch text message', async () => {
      const responses = [{ type: 'text', content: 'Hello world' }]

      await dispatchResponsesSequentially(responses, {
        ctx: mockCtx as Context,
        sessionData: mockSessionData,
        userService: mockUserService as UserService,
        env: mockEnv
      })

      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        12345,
        'Hello world',
        {
          ...mockSessionData.chat_settings.send_message_option,
          parse_mode: 'Markdown'
        }
      )
    })

    it('should dispatch emoji message with sticker', async () => {
      const mockStickers: Sticker[] = [
        { emoji: '👍', file_id: 'sticker_123', set_name: 'test_sticker_set' },
        { emoji: '😀', file_id: 'sticker_456', set_name: 'test_sticker_set' }
      ]

      mockTelegram.getStickerSet.mockResolvedValue({
        stickers: mockStickers
      })

      const responses = [{ type: 'emoji', content: '👍' }]

      await dispatchResponsesSequentially(responses, {
        ctx: mockCtx as Context,
        sessionData: mockSessionData,
        userService: mockUserService as UserService,
        env: mockEnv
      })

      expect(mockTelegram.getStickerSet).toHaveBeenCalledWith('test_sticker_set')
      expect(mockTelegram.sendSticker).toHaveBeenCalledWith(
        12345,
        'sticker_123',
        mockSessionData.chat_settings.send_message_option
      )
    })

    it('should dispatch reaction message', async () => {
      const responses = [{ type: 'reaction', content: '👍' }]

      await dispatchResponsesSequentially(responses, {
        ctx: mockCtx as Context,
        sessionData: mockSessionData,
        userService: mockUserService as UserService,
        env: mockEnv
      })

      expect(mockTelegram.setMessageReaction).toHaveBeenCalledWith(
        12345,
        111,
        [
          {
            type: 'emoji',
            emoji: '👍'
          }
        ]
      )
    })

    it('should dispatch image message and deduct coins', async () => {
      // Base64 encoded 1x1 red PNG
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

      const responses = [{ type: 'image', content: base64Image }]

      await dispatchResponsesSequentially(responses, {
        ctx: mockCtx as Context,
        sessionData: mockSessionData,
        userService: mockUserService as UserService,
        env: mockEnv
      })

      expect(mockUserService.deductCoins).toHaveBeenCalledWith(
        67890,
        1,
        'image_generation'
      )

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.telegram.org/bottest-bot-token/sendPhoto',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData)
        })
      )
    })

    it('should include thread_id in image form when thread_id is set', async () => {
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      const sessionDataWithThread: SessionData = {
        ...mockSessionData,
        chat_settings: {
          thread_id: 999
        }
      }

      const responses = [{ type: 'image', content: base64Image }]

      await dispatchResponsesSequentially(responses, {
        ctx: mockCtx as Context,
        sessionData: sessionDataWithThread,
        userService: mockUserService as UserService,
        env: mockEnv
      })

      const fetchCall = vi.mocked(global.fetch).mock.calls[0]
      expect(fetchCall[0]).toBe('https://api.telegram.org/bottest-bot-token/sendPhoto')
      expect(fetchCall[1]?.method).toBe('POST')

      // Verify FormData contains thread_id
      const formData = fetchCall[1]?.body as FormData
      expect(formData).toBeInstanceOf(FormData)
    })

    it('should dispatch multiple responses in sequence', async () => {
      mockTelegram.getStickerSet.mockResolvedValue({
        stickers: [
          { emoji: '👍', file_id: 'sticker_123', set_name: 'test_sticker_set' }
        ]
      })

      const responses = [
        { type: 'text', content: 'First message' },
        { type: 'emoji', content: '👍' },
        { type: 'reaction', content: '😀' }
      ]

      await dispatchResponsesSequentially(responses, {
        ctx: mockCtx as Context,
        sessionData: mockSessionData,
        userService: mockUserService as UserService,
        env: mockEnv
      })

      expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1)
      expect(mockTelegram.sendSticker).toHaveBeenCalledTimes(1)
      expect(mockTelegram.setMessageReaction).toHaveBeenCalledTimes(1)
    })

    it('should handle empty responses array', async () => {
      await dispatchResponsesSequentially([], {
        ctx: mockCtx as Context,
        sessionData: mockSessionData,
        userService: mockUserService as UserService,
        env: mockEnv
      })

      expect(mockTelegram.sendMessage).not.toHaveBeenCalled()
      expect(mockTelegram.sendSticker).not.toHaveBeenCalled()
      expect(mockTelegram.setMessageReaction).not.toHaveBeenCalled()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('should handle text message with custom send_message_option', async () => {
      const customSessionData: SessionData = {
        ...mockSessionData,
        chat_settings: {
          send_message_option: {
            reply_to_message_id: 222
          }
        }
      }

      const responses = [{ type: 'text', content: 'Test' }]

      await dispatchResponsesSequentially(responses, {
        ctx: mockCtx as Context,
        sessionData: customSessionData,
        userService: mockUserService as UserService,
        env: mockEnv
      })

      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        12345,
        'Test',
        {
          reply_to_message_id: 222,
          parse_mode: 'Markdown'
        }
      )
    })

    it('should handle reaction when message_id is undefined', async () => {
      const ctxWithoutMessageId = {
        ...mockCtx,
        message: undefined
      }

      const responses = [{ type: 'reaction', content: '👍' }]

      await dispatchResponsesSequentially(responses, {
        ctx: ctxWithoutMessageId as Context,
        sessionData: mockSessionData,
        userService: mockUserService as UserService,
        env: mockEnv
      })

      // Should not call setMessageReaction when message_id is undefined
      expect(mockTelegram.setMessageReaction).not.toHaveBeenCalled()
    })

    it('should handle multiple sticker packs', async () => {
      const sessionDataWithMultiplePacks: SessionData = {
        ...mockSessionData,
        stickersPacks: ['pack1', 'pack2', 'pack3']
      }

      mockTelegram.getStickerSet.mockResolvedValue({
        stickers: [
          { emoji: '👍', file_id: 'sticker_123', set_name: 'pack1' }
        ]
      })

      const responses = [{ type: 'emoji', content: '👍' }]

      await dispatchResponsesSequentially(responses, {
        ctx: mockCtx as Context,
        sessionData: sessionDataWithMultiplePacks,
        userService: mockUserService as UserService,
        env: mockEnv
      })

      expect(mockTelegram.getStickerSet).toHaveBeenCalled()
      const calledWith = mockTelegram.getStickerSet.mock.calls[0][0]
      expect(['pack1', 'pack2', 'pack3']).toContain(calledWith)
    })
  })
})

