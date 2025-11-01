import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Context, Telegraf } from 'telegraf'
import { configureChatSettings } from '../../src/commands/chatSettings'
import type { SessionController } from '../../src/service/SessionController'
import type { SessionData } from '../../src/types'

describe('configureChatSettings command', () => {
  let bot: Telegraf<Context<any>>
  let sessionController: SessionController
  let userService: any
  let ctx: Partial<Context>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    ctx = {
      chat: { id: 123 } as any,
      message: {
        text: '/set_tread_id 999'
      } as any,
      reply: vi.fn().mockResolvedValue(undefined),
      telegram: {
        sendMessage: vi.fn().mockResolvedValue(undefined)
      } as any
    }

    bot = {
      command: vi.fn((command, handler) => {
        if (command === 'set_tread_id') {
          ;(bot as any).chatSettingsHandler = handler
        }
      })
    } as any

    sessionController = {
      getSession: vi.fn(),
      updateSession: vi.fn().mockResolvedValue(undefined)
    } as any

    userService = {}

    configureChatSettings(bot, sessionController, userService)
  })

  it('should register set_tread_id command handler', () => {
    expect(bot.command).toHaveBeenCalledWith(
      'set_tread_id',
      expect.any(Function)
    )
  })

  describe('command handler execution', () => {
    it('should update chat settings with thread id', async () => {
      const sessionData: SessionData = {
        userMessages: [],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: 'gpt-4.1-mini',
        memories: [],
        chat_settings: {}
      }

      vi.mocked(sessionController.getSession).mockResolvedValue(sessionData)

      const handler = (bot as any).chatSettingsHandler
      await handler(ctx as Context)

      expect(sessionController.getSession).toHaveBeenCalledWith(123)
      expect(sessionController.updateSession).toHaveBeenCalledWith(123, {
        chat_settings: {
          thread_id: 999,
          reply_only_in_thread: true,
          send_message_option: {
            message_thread_id: 999
          }
        }
      })
      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'Настройки обновлены, установлет id топика: 999'
      )
    })

    it('should return error when topic id is not provided', async () => {
      const ctxWithNoId = {
        ...ctx,
        message: { text: '/set_tread_id' } as any
      }

      vi.mocked(sessionController.getSession).mockResolvedValue({
        userMessages: [],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: 'gpt-4.1-mini',
        memories: [],
        chat_settings: {}
      } as SessionData)

      const handler = (bot as any).chatSettingsHandler
      await handler(ctxWithNoId as Context)

      expect(ctxWithNoId.reply).toHaveBeenCalledWith(
        expect.stringContaining('Пожалуйста, укажите id топика'),
        expect.objectContaining({ parse_mode: 'Markdown' })
      )
      expect(sessionController.updateSession).not.toHaveBeenCalled()
    })

    it('should return error when topic id is not a valid number', async () => {
      const ctxWithInvalidId = {
        ...ctx,
        message: { text: '/set_tread_id abc' } as any
      }

      vi.mocked(sessionController.getSession).mockResolvedValue({
        userMessages: [],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: 'gpt-4.1-mini',
        memories: [],
        chat_settings: {}
      } as SessionData)

      const handler = (bot as any).chatSettingsHandler
      await handler(ctxWithInvalidId as Context)

      expect(ctxWithInvalidId.reply).toHaveBeenCalledWith(
        expect.stringContaining('Пожалуйста, укажите id топика'),
        expect.objectContaining({ parse_mode: 'Markdown' })
      )
      expect(sessionController.updateSession).not.toHaveBeenCalled()
    })

    it('should handle empty string topic id', async () => {
      const ctxWithEmptyId = {
        ...ctx,
        message: { text: '/set_tread_id ' } as any
      }

      vi.mocked(sessionController.getSession).mockResolvedValue({
        userMessages: [],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: 'gpt-4.1-mini',
        memories: [],
        chat_settings: {}
      } as SessionData)

      const handler = (bot as any).chatSettingsHandler
      await handler(ctxWithEmptyId as Context)

      expect(ctxWithEmptyId.reply).toHaveBeenCalled()
      expect(sessionController.updateSession).not.toHaveBeenCalled()
    })

    it('should extract topic id from command text correctly', async () => {
      const sessionData: SessionData = {
        userMessages: [],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: 'gpt-4.1-mini',
        memories: [],
        chat_settings: {}
      }

      vi.mocked(sessionController.getSession).mockResolvedValue(sessionData)

      const testCases = [
        { text: '/set_tread_id 123', expectedId: 123 },
        { text: '/set_tread_id 456', expectedId: 456 },
        { text: '/set_tread_id  789  ', expectedId: 789 }
      ]

      for (const testCase of testCases) {
        vi.clearAllMocks()
        const testCtx = {
          ...ctx,
          message: { text: testCase.text } as any
        }

        const handler = (bot as any).chatSettingsHandler
        await handler(testCtx as Context)

        expect(sessionController.updateSession).toHaveBeenCalledWith(123, {
          chat_settings: {
            thread_id: testCase.expectedId,
            reply_only_in_thread: true,
            send_message_option: {
              message_thread_id: testCase.expectedId
            }
          }
        })
      }
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(sessionController.getSession).mockRejectedValue(
        new Error('Storage error')
      )

      const handler = (bot as any).chatSettingsHandler
      await handler(ctx as Context)

      expect(console.error).toHaveBeenCalledWith(
        'Error add_sticker_pack:',
        expect.any(Error)
      )
    })

    it('should handle updateSession errors gracefully', async () => {
      const sessionData: SessionData = {
        userMessages: [],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: 'gpt-4.1-mini',
        memories: [],
        chat_settings: {}
      }

      vi.mocked(sessionController.getSession).mockResolvedValue(sessionData)
      vi.mocked(sessionController.updateSession).mockRejectedValue(
        new Error('Update error')
      )

      const handler = (bot as any).chatSettingsHandler
      await handler(ctx as Context)

      expect(console.error).toHaveBeenCalledWith(
        'Error add_sticker_pack:',
        expect.any(Error)
      )
    })

    it('should set reply_only_in_thread to true when setting thread id', async () => {
      const sessionData: SessionData = {
        userMessages: [],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: 'gpt-4.1-mini',
        memories: [],
        chat_settings: {
          reply_only_in_thread: false
        }
      }

      vi.mocked(sessionController.getSession).mockResolvedValue(sessionData)

      const handler = (bot as any).chatSettingsHandler
      await handler(ctx as Context)

      expect(sessionController.updateSession).toHaveBeenCalledWith(123, {
        chat_settings: {
          thread_id: 999,
          reply_only_in_thread: true,
          send_message_option: {
            message_thread_id: 999
          }
        }
      })
    })
  })
})

