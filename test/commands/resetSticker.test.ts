import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Context, Telegraf } from 'telegraf'
import { resetSticker } from '../../src/commands/resetSticker'
import type { SessionController } from '../../src/service/SessionController'
import type { SessionData } from '../../src/types'

describe('resetSticker command', () => {
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
        if (command === 'reset_sticker_pack') {
          ;(bot as any).resetStickerHandler = handler
        }
      })
    } as any

    sessionController = {
      getSession: vi.fn(),
      resetStickers: vi.fn().mockResolvedValue(undefined)
    } as any

    userService = {}

    resetSticker(bot, sessionController, userService)
  })

  it('should register reset_sticker_pack command handler', () => {
    expect(bot.command).toHaveBeenCalledWith(
      'reset_sticker_pack',
      expect.any(Function)
    )
  })

  describe('command handler execution', () => {
    it('should reset stickers and notify user', async () => {
      const sessionData: SessionData = {
        userMessages: [],
        stickersPacks: ['custom_pack1', 'custom_pack2'],
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

      const handler = (bot as any).resetStickerHandler
      await handler(ctx as Context)

      expect(sessionController.getSession).toHaveBeenCalledWith(123)
      expect(sessionController.resetStickers).toHaveBeenCalledWith(123)
      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'Стикер пак обновлен до стандартного',
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

      const handler = (bot as any).resetStickerHandler
      await handler(ctx as Context)

      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'Стикер пак обновлен до стандартного',
        { parse_mode: 'HTML' }
      )
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(sessionController.getSession).mockRejectedValue(
        new Error('Storage error')
      )

      const handler = (bot as any).resetStickerHandler
      await handler(ctx as Context)

      expect(console.error).toHaveBeenCalledWith(
        'Error reset_sticker_pack:',
        expect.any(Error)
      )
    })

    it('should handle resetStickers errors gracefully', async () => {
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
          send_message_option: {}
        }
      }

      vi.mocked(sessionController.getSession).mockResolvedValue(sessionData)
      vi.mocked(sessionController.resetStickers).mockRejectedValue(
        new Error('Reset error')
      )

      const handler = (bot as any).resetStickerHandler
      await handler(ctx as Context)

      expect(console.error).toHaveBeenCalledWith(
        'Error reset_sticker_pack:',
        expect.any(Error)
      )
    })
  })
})

