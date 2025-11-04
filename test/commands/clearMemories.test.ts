import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Context, Telegraf } from 'telegraf'
import { clearMemories } from '../../src/commands/clearMemories'
import type { SessionController } from '../../src/service/SessionController'
import type { SessionData } from '../../src/types'

describe('clearMemories command', () => {
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
        if (command === 'clear_memories') {
          ;(bot as any).clearMemoriesHandler = handler
        }
      })
    } as any

    sessionController = {
      getSession: vi.fn(),
      updateSession: vi.fn().mockResolvedValue(undefined)
    } as any

    userService = {}

    clearMemories(bot, sessionController, userService)
  })

  it('should register clear_memories command handler', () => {
    expect(bot.command).toHaveBeenCalledWith(
      'clear_memories',
      expect.any(Function)
    )
  })

  describe('command handler execution', () => {
    it('should clear memories and notify user', async () => {
      const sessionData: SessionData = {
        userMessages: [],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: 'gpt-4o-mini',
        memories: [
          { content: 'Memory 1', timestamp: '2024-01-01T00:00:00Z' },
          { content: 'Memory 2', timestamp: '2024-01-02T00:00:00Z' }
        ],
        chat_settings: {
          send_message_option: { parse_mode: 'Markdown' }
        }
      }

      vi.mocked(sessionController.getSession).mockResolvedValue(sessionData)

      const handler = (bot as any).clearMemoriesHandler
      await handler(ctx as Context)

      expect(sessionController.getSession).toHaveBeenCalledWith(123)
      expect(sessionController.updateSession).toHaveBeenCalledWith(123, {
        memories: []
      })
      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'Все сохраненные воспоминания были удалены.',
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

      const handler = (bot as any).clearMemoriesHandler
      await handler(ctx as Context)

      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'Все сохраненные воспоминания были удалены.',
        { parse_mode: 'HTML' }
      )
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(sessionController.getSession).mockRejectedValue(
        new Error('Storage error')
      )

      const handler = (bot as any).clearMemoriesHandler
      await handler(ctx as Context)

      expect(console.error).toHaveBeenCalledWith(
        'Error clearing memories:',
        expect.any(Error)
      )
    })

    it('should clear memories even when array is already empty', async () => {
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

      const handler = (bot as any).clearMemoriesHandler
      await handler(ctx as Context)

      expect(sessionController.updateSession).toHaveBeenCalledWith(123, {
        memories: []
      })
      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'Все сохраненные воспоминания были удалены.',
        {}
      )
    })
  })
})




