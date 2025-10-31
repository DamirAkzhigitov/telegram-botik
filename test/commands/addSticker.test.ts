import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Context, Telegraf } from 'telegraf'
import { addSticker } from '../../src/commands/addSticker'
import type { SessionController } from '../../src/service/SessionController'
import type { SessionData } from '../../src/types'

describe('addSticker command', () => {
  let bot: Telegraf<Context<any>>
  let sessionController: SessionController
  let userService: any
  let ctx: Partial<Context>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    ctx = {
      chat: { id: 123 } as any,
      telegram: {
        sendMessage: vi.fn().mockResolvedValue(undefined)
      } as any
    }

    bot = {
      command: vi.fn((command, handler) => {
        if (command === 'add_sticker_pack') {
          ;(bot as any).addStickerHandler = handler
        }
      })
    } as any

    sessionController = {
      getSession: vi.fn(),
      updateSession: vi.fn().mockResolvedValue(undefined)
    } as any

    userService = {}

    addSticker(bot, sessionController, userService)
  })

  it('should register add_sticker_pack command handler', () => {
    expect(bot.command).toHaveBeenCalledWith(
      'add_sticker_pack',
      expect.any(Function)
    )
  })

  describe('command handler execution', () => {
    it('should set stickerNotSet to true and prompt for sticker', async () => {
      const sessionData: SessionData = {
        userMessages: [],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: 'gpt-4o-mini',
        memories: [],
        chat_settings: {
          send_message_option: { parse_mode: 'Markdown' }
        }
      }

      vi.mocked(sessionController.getSession).mockResolvedValue(sessionData)

      const handler = (bot as any).addStickerHandler
      await handler(ctx as Context)

      expect(sessionController.getSession).toHaveBeenCalledWith(123)
      expect(sessionController.updateSession).toHaveBeenCalledWith(123, {
        stickerNotSet: true
      })
      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'В следующем сообщении отправьте стикер который я должен использовать',
        { parse_mode: 'Markdown' }
      )
    })

    it('should use chat_settings.send_message_option for response', async () => {
      const sessionData: SessionData = {
        userMessages: [],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: 'gpt-4o-mini',
        memories: [],
        chat_settings: {
          send_message_option: { parse_mode: 'HTML' }
        }
      }

      vi.mocked(sessionController.getSession).mockResolvedValue(sessionData)

      const handler = (bot as any).addStickerHandler
      await handler(ctx as Context)

      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'В следующем сообщении отправьте стикер который я должен использовать',
        { parse_mode: 'HTML' }
      )
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(sessionController.getSession).mockRejectedValue(
        new Error('Storage error')
      )

      const handler = (bot as any).addStickerHandler
      await handler(ctx as Context)

      expect(console.error).toHaveBeenCalledWith(
        'Error add_sticker_pack:',
        expect.any(Error)
      )
    })

    it('should set stickerNotSet regardless of current value', async () => {
      const sessionData: SessionData = {
        userMessages: [],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: true,
        toggle_history: true,
        model: 'gpt-4o-mini',
        memories: [],
        chat_settings: {
          send_message_option: {}
        }
      }

      vi.mocked(sessionController.getSession).mockResolvedValue(sessionData)

      const handler = (bot as any).addStickerHandler
      await handler(ctx as Context)

      expect(sessionController.updateSession).toHaveBeenCalledWith(123, {
        stickerNotSet: true
      })
    })
  })
})

