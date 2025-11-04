import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Context, Telegraf } from 'telegraf'
import { showMemories } from '../../src/commands/showMemories'
import type { SessionController } from '../../src/service/SessionController'
import type { SessionData } from '../../src/types'

describe('showMemories command', () => {
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
        if (command === 'show_memories') {
          ;(bot as any).showMemoriesHandler = handler
        }
      })
    } as any

    sessionController = {
      getSession: vi.fn()
    } as any

    userService = {}

    showMemories(bot, sessionController, userService)
  })

  it('should register show_memories command handler', () => {
    expect(bot.command).toHaveBeenCalledWith(
      'show_memories',
      expect.any(Function)
    )
  })

  describe('command handler execution', () => {
    it('should display message when no memories exist', async () => {
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

      const handler = (bot as any).showMemoriesHandler
      await handler(ctx as Context)

      expect(sessionController.getSession).toHaveBeenCalledWith(123)
      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'У меня пока нет сохраненных воспоминаний об этом чате.',
        {}
      )
    })

    it('should display memories when they exist', async () => {
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
          { content: 'Memory 2', timestamp: '2024-01-02T00:00:00Z' },
          { content: 'Memory 3', timestamp: '2024-01-03T00:00:00Z' }
        ],
        chat_settings: {
          send_message_option: { parse_mode: 'Markdown' }
        }
      }

      vi.mocked(sessionController.getSession).mockResolvedValue(sessionData)

      const handler = (bot as any).showMemoriesHandler
      await handler(ctx as Context)

      expect(sessionController.getSession).toHaveBeenCalledWith(123)
      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('Вот что я запомнил:'),
        { parse_mode: 'Markdown' }
      )

      const messageText = vi.mocked(ctx.telegram!.sendMessage).mock.calls[0][1] as string
      expect(messageText).toContain('1. Memory 1')
      expect(messageText).toContain('2. Memory 2')
      expect(messageText).toContain('3. Memory 3')
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
        memories: [{ content: 'Test memory', timestamp: '2024-01-01T00:00:00Z' }],
        chat_settings: {
          send_message_option: { parse_mode: 'HTML', reply_markup: {} as any }
        }
      }

      vi.mocked(sessionController.getSession).mockResolvedValue(sessionData)

      const handler = (bot as any).showMemoriesHandler
      await handler(ctx as Context)

      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        expect.any(String),
        sessionData.chat_settings.send_message_option
      )
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(sessionController.getSession).mockRejectedValue(
        new Error('Storage error')
      )

      const handler = (bot as any).showMemoriesHandler
      await handler(ctx as Context)

      expect(console.error).toHaveBeenCalledWith(
        'Error showing memories:',
        expect.any(Error)
      )
    })

    it('should handle empty memories array', async () => {
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

      const handler = (bot as any).showMemoriesHandler
      await handler(ctx as Context)

      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'У меня пока нет сохраненных воспоминаний об этом чате.',
        {}
      )
    })
  })
})




