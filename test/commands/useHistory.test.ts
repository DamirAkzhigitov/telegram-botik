import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Context, Telegraf } from 'telegraf'
import { useHistory } from '../../src/commands/useHistory'
import type { SessionController } from '../../src/service/SessionController'
import type { SessionData } from '../../src/types'

describe('useHistory command', () => {
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
        if (command === 'toggle_history') {
          ;(bot as any).useHistoryHandler = handler
        }
      })
    } as any

    sessionController = {
      getSession: vi.fn(),
      updateSession: vi.fn().mockResolvedValue(undefined)
    } as any

    userService = {}

    useHistory(bot, sessionController, userService)
  })

  it('should register toggle_history command handler', () => {
    expect(bot.command).toHaveBeenCalledWith(
      'toggle_history',
      expect.any(Function)
    )
  })

  describe('command handler execution', () => {
    it('should toggle history from true to false', async () => {
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

      const handler = (bot as any).useHistoryHandler
      await handler(ctx as Context)

      expect(sessionController.getSession).toHaveBeenCalledWith(123)
      expect(sessionController.updateSession).toHaveBeenCalledWith(123, {
        toggle_history: false
      })
      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'Параметр toggle_history установлен: false',
        { parse_mode: 'Markdown' }
      )
    })

    it('should toggle history from false to true', async () => {
      const sessionData: SessionData = {
        userMessages: [],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: false,
        model: 'gpt-4o-mini',
        memories: [],
        chat_settings: {
          send_message_option: { parse_mode: 'Markdown' }
        }
      }

      vi.mocked(sessionController.getSession).mockResolvedValue(sessionData)

      const handler = (bot as any).useHistoryHandler
      await handler(ctx as Context)

      expect(sessionController.updateSession).toHaveBeenCalledWith(123, {
        toggle_history: true
      })
      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'Параметр toggle_history установлен: true',
        { parse_mode: 'Markdown' }
      )
    })

    it('should default to true when toggle_history is not in session', async () => {
      const sessionData: Partial<SessionData> = {
        userMessages: [],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        model: 'gpt-4o-mini',
        memories: [],
        chat_settings: {
          send_message_option: {}
        }
      }

      vi.mocked(sessionController.getSession).mockResolvedValue(
        sessionData as SessionData
      )

      const handler = (bot as any).useHistoryHandler
      await handler(ctx as Context)

      expect(sessionController.updateSession).toHaveBeenCalledWith(123, {
        toggle_history: true
      })
      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'Параметр toggle_history установлен: true',
        {}
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

      const handler = (bot as any).useHistoryHandler
      await handler(ctx as Context)

      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('toggle_history установлен:'),
        { parse_mode: 'HTML' }
      )
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(sessionController.getSession).mockRejectedValue(
        new Error('Storage error')
      )

      const handler = (bot as any).useHistoryHandler
      await handler(ctx as Context)

      expect(console.error).toHaveBeenCalledWith(
        'Error updating prompt:',
        expect.any(Error)
      )
    })
  })
})

