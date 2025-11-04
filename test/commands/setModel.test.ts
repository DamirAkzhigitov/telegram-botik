import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Context, Telegraf } from 'telegraf'
import { setModel } from '../../src/commands/setModel'
import type { SessionController } from '../../src/service/SessionController'
import type { SessionData } from '../../src/types'
import { ALLOWED_TEXT_MODELS, DEFAULT_TEXT_MODEL } from '../../src/constants/models'

describe('setModel command', () => {
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
        if (command === 'set_model') {
          ;(bot as any).setModelHandler = handler
        }
      })
    } as any

    sessionController = {
      getSession: vi.fn(),
      updateSession: vi.fn().mockResolvedValue(undefined)
    } as any

    userService = {}

    setModel(bot, sessionController, userService)
  })

  it('should register set_model command handler', () => {
    expect(bot.command).toHaveBeenCalledWith('set_model', expect.any(Function))
  })

  describe('command handler execution', () => {
    it('should set model to not_set and prompt for model selection', async () => {
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

      const handler = (bot as any).setModelHandler
      await handler(ctx as Context)

      expect(sessionController.getSession).toHaveBeenCalledWith(123)
      expect(sessionController.updateSession).toHaveBeenCalledWith(123, {
        model: 'not_set'
      })

      const expectedMessage = `Отправьте в следующем сообщении одну из моделей: ${ALLOWED_TEXT_MODELS.join(', ')}.\nЕсли выбрать не получится, установим ${DEFAULT_TEXT_MODEL}.`

      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        expectedMessage,
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

      const handler = (bot as any).setModelHandler
      await handler(ctx as Context)

      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        123,
        expect.any(String),
        { parse_mode: 'HTML' }
      )
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(sessionController.getSession).mockRejectedValue(
        new Error('Storage error')
      )

      const handler = (bot as any).setModelHandler
      await handler(ctx as Context)

      expect(console.error).toHaveBeenCalledWith(
        'Error updating prompt:',
        expect.any(Error)
      )
    })

    it('should include all allowed models in the message', async () => {
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

      const handler = (bot as any).setModelHandler
      await handler(ctx as Context)

      const messageText = vi.mocked(ctx.telegram!.sendMessage).mock.calls[0][1] as string

      for (const model of ALLOWED_TEXT_MODELS) {
        expect(messageText).toContain(model)
      }
      expect(messageText).toContain(DEFAULT_TEXT_MODEL)
    })
  })
})

