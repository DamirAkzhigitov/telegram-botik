import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Context, Telegraf } from 'telegraf'
import { getPrompt } from '../../src/commands/getPrompt'
import type { SessionController } from '../../src/service/SessionController'
import type { SessionData } from '../../src/types'

describe('getPrompt command', () => {
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
        if (command === 'get_prompt') {
          ;(bot as any).getPromptHandler = handler
        }
      })
    } as any

    sessionController = {
      getSession: vi.fn()
    } as any

    userService = {}

    getPrompt(bot, sessionController, userService)
  })

  it('should register get_prompt command handler', () => {
    expect(bot.command).toHaveBeenCalledWith('get_prompt', expect.any(Function))
  })

  describe('command handler execution', () => {
    it('should display current prompt', async () => {
      const sessionData: SessionData = {
        userMessages: [],
        stickersPacks: [],
        prompt: 'You are a helpful assistant',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: 'gpt-4o-mini',
        memories: [],
        chat_settings: {}
      }

      vi.mocked(sessionController.getSession).mockResolvedValue(sessionData)

      const handler = (bot as any).getPromptHandler
      await handler(ctx as Context)

      expect(sessionController.getSession).toHaveBeenCalledWith(123)
      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'Текущий промпт: You are a helpful assistant'
      )
    })

    it('should display empty prompt when prompt is empty string', async () => {
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
        chat_settings: {}
      }

      vi.mocked(sessionController.getSession).mockResolvedValue(sessionData)

      const handler = (bot as any).getPromptHandler
      await handler(ctx as Context)

      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'Текущий промпт: '
      )
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(sessionController.getSession).mockRejectedValue(
        new Error('Storage error')
      )

      const handler = (bot as any).getPromptHandler
      await handler(ctx as Context)

      expect(console.error).toHaveBeenCalledWith(
        'Error get_prompt:',
        expect.any(Error)
      )
    })

    it('should display prompt with special characters correctly', async () => {
      const sessionData: SessionData = {
        userMessages: [],
        stickersPacks: [],
        prompt: 'Prompt with "quotes" and \'apostrophes\'',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: 'gpt-4o-mini',
        memories: [],
        chat_settings: {}
      }

      vi.mocked(sessionController.getSession).mockResolvedValue(sessionData)

      const handler = (bot as any).getPromptHandler
      await handler(ctx as Context)

      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'Текущий промпт: Prompt with "quotes" and \'apostrophes\''
      )
    })
  })
})




