import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Context, Telegraf } from 'telegraf'
import { setNewPrompt } from '../../src/commands/setNewPrompt'
import type { SessionController } from '../../src/service/SessionController'
import type { SessionData } from '../../src/types'

describe('setNewPrompt command', () => {
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
        if (command === 'set_new_prompt') {
          ;(bot as any).setNewPromptHandler = handler
        }
      })
    } as any

    sessionController = {
      getSession: vi.fn(),
      updateSession: vi.fn().mockResolvedValue(undefined)
    } as any

    userService = {}

    setNewPrompt(bot, sessionController, userService)
  })

  it('should register set_new_prompt command handler', () => {
    expect(bot.command).toHaveBeenCalledWith(
      'set_new_prompt',
      expect.any(Function)
    )
  })

  describe('command handler execution', () => {
    it('should set promptNotSet to true and prompt for new prompt', async () => {
      const sessionData: SessionData = {
        userMessages: [],
        stickersPacks: [],
        prompt: 'Old prompt',
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

      const handler = (bot as any).setNewPromptHandler
      await handler(ctx as Context)

      expect(sessionController.getSession).toHaveBeenCalledWith(123)
      expect(sessionController.updateSession).toHaveBeenCalledWith(123, {
        promptNotSet: true
      })
      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'В следующем сообщении отправьте системный промпт',
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

      const handler = (bot as any).setNewPromptHandler
      await handler(ctx as Context)

      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        'В следующем сообщении отправьте системный промпт',
        { parse_mode: 'HTML' }
      )
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(sessionController.getSession).mockRejectedValue(
        new Error('Storage error')
      )

      const handler = (bot as any).setNewPromptHandler
      await handler(ctx as Context)

      expect(console.error).toHaveBeenCalledWith(
        'Error updating prompt:',
        expect.any(Error)
      )
    })

    it('should set promptNotSet regardless of current prompt value', async () => {
      const sessionData: SessionData = {
        userMessages: [],
        stickersPacks: [],
        prompt: 'Existing prompt',
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

      const handler = (bot as any).setNewPromptHandler
      await handler(ctx as Context)

      expect(sessionController.updateSession).toHaveBeenCalledWith(123, {
        promptNotSet: true
      })
    })
  })
})




