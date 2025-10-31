import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Context, Telegraf } from 'telegraf'
import { clearMessage } from '../../src/commands/clearMessage'
import type { SessionController } from '../../src/service/SessionController'
import type { SessionData } from '../../src/types'

describe('clearMessage command', () => {
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
        if (command === 'clear_messages') {
          ;(bot as any).clearMessageHandler = handler
        }
      })
    } as any

    sessionController = {
      getSession: vi.fn(),
      updateSession: vi.fn().mockResolvedValue(undefined)
    } as any

    userService = {}

    clearMessage(bot, sessionController, userService)
  })

  it('should register clear_messages command handler', () => {
    expect(bot.command).toHaveBeenCalledWith(
      'clear_messages',
      expect.any(Function)
    )
  })

  describe('command handler execution', () => {
    it('should clear user messages and notify user', async () => {
      const sessionData: SessionData = {
        userMessages: [
          { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] }
        ],
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

      const handler = (bot as any).clearMessageHandler
      await handler(ctx as Context)

      expect(sessionController.getSession).toHaveBeenCalledWith(123)
      expect(sessionController.updateSession).toHaveBeenCalledWith(123, {
        userMessages: []
      })
      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'История сообщений очищена',
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

      const handler = (bot as any).clearMessageHandler
      await handler(ctx as Context)

      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'История сообщений очищена',
        { parse_mode: 'HTML' }
      )
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(sessionController.getSession).mockRejectedValue(
        new Error('Storage error')
      )

      const handler = (bot as any).clearMessageHandler
      await handler(ctx as Context)

      expect(console.error).toHaveBeenCalledWith(
        'Error clear_messages:',
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
        model: 'gpt-4o-mini',
        memories: [],
        chat_settings: {
          send_message_option: {}
        }
      }

      vi.mocked(sessionController.getSession).mockResolvedValue(sessionData)
      vi.mocked(sessionController.updateSession).mockRejectedValue(
        new Error('Update error')
      )

      const handler = (bot as any).clearMessageHandler
      await handler(ctx as Context)

      expect(console.error).toHaveBeenCalledWith(
        'Error clear_messages:',
        expect.any(Error)
      )
    })
  })
})

