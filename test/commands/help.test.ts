import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Context, Telegraf } from 'telegraf'
import { help } from '../../src/commands/help'
import type { UserService } from '../../src/service/UserService'
import { AdminAuthService } from '../../src/service/AdminAuthService'

// Mock AdminAuthService
vi.mock('../../src/service/AdminAuthService', () => ({
  AdminAuthService: vi.fn()
}))

describe('help command', () => {
  let bot: Telegraf<Context<any>>
  let sessionController: any
  let userService: UserService | undefined
  let env: any
  let ctx: Partial<Context>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    ctx = {
      from: { id: 123, username: 'testuser', is_bot: false } as any,
      chat: { id: 456 } as any,
      telegram: {
        sendMessage: vi.fn().mockResolvedValue(undefined)
      } as any
    }

    bot = {
      command: vi.fn((command, handler) => {
        // Store handler for testing
        if (command === 'help') {
          ;(bot as any).helpHandler = handler
        }
      })
    } as any

    sessionController = {}

    userService = {
      getUserBalance: vi.fn()
    } as any

    env = {
      BOT_TOKEN: 'test-token'
    }

    help(bot, sessionController, userService, env)
  })

  it('should register help command handler', () => {
    expect(bot.command).toHaveBeenCalledWith('help', expect.any(Function))
  })

  describe('command handler execution', () => {
    it('should send help message with balance info when userService is available', async () => {
      vi.mocked(userService!.getUserBalance).mockResolvedValue(100)

      const handler = (bot as any).helpHandler
      await handler(ctx as Context)

      expect(userService!.getUserBalance).toHaveBeenCalledWith(123)
      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        456,
        expect.stringContaining('Available Commands'),
        expect.objectContaining({ parse_mode: 'Markdown' })
      )
      const messageCall = vi.mocked(ctx.telegram!.sendMessage).mock.calls[0]
      expect(messageCall[1]).toContain('100 coins')
    })

    it('should send help message without balance info when userService is not available', async () => {
      // Create a separate bot instance for this test
      const testBot = {
        command: vi.fn((command, handler) => {
          if (command === 'help') {
            ;(testBot as any).helpHandler = handler
          }
        })
      } as any

      await help(testBot, sessionController, undefined, env)
      const handler = (testBot as any).helpHandler

      await handler(ctx as Context)

      expect(ctx.telegram!.sendMessage).toHaveBeenCalled()
      const allMessages = vi.mocked(ctx.telegram!.sendMessage).mock.calls
      const helpMessageCall = allMessages.find(
        (call) => typeof call[1] === 'string' && call[1].includes('Available Commands')
      )
      expect(helpMessageCall).toBeDefined()
      const messageText = helpMessageCall![1] as string
      expect(messageText).toContain('Available Commands')
      // Should not contain the dynamic balance info line
      expect(messageText).not.toMatch(/\n💰 Your current balance: \*\*\d+ coins\*\*\n/)
    })

    it('should send help message without balance info when ctx.from is undefined', async () => {
      const ctxWithoutFrom = { ...ctx, from: undefined }

      const handler = (bot as any).helpHandler
      await handler(ctxWithoutFrom as Context)

      expect(userService!.getUserBalance).not.toHaveBeenCalled()
      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        456,
        expect.stringContaining('Available Commands'),
        expect.objectContaining({ parse_mode: 'Markdown' })
      )
    })

    it('should handle balance fetch errors gracefully', async () => {
      vi.mocked(userService!.getUserBalance).mockRejectedValue(
        new Error('Database error')
      )

      const handler = (bot as any).helpHandler
      await handler(ctx as Context)

      expect(userService!.getUserBalance).toHaveBeenCalledWith(123)
      expect(console.error).toHaveBeenCalledWith(
        'Error getting balance for help:',
        expect.any(Error)
      )
      expect(ctx.telegram!.sendMessage).toHaveBeenCalled()
    })

    it('should handle sendMessage errors gracefully', async () => {
      vi.mocked(ctx.telegram!.sendMessage).mockRejectedValue(
        new Error('Telegram API error')
      )

      const handler = (bot as any).helpHandler
      await handler(ctx as Context)

      expect(console.error).toHaveBeenCalledWith(
        'Error help:',
        expect.any(Error)
      )
    })

    it('should include all command categories in help message', async () => {
      vi.mocked(userService!.getUserBalance).mockResolvedValue(50)

      const handler = (bot as any).helpHandler
      await handler(ctx as Context)

      const sendMessageCall = vi.mocked(ctx.telegram!.sendMessage).mock
        .calls[0][1] as string

      expect(sendMessageCall).toContain('General Commands')
      expect(sendMessageCall).toContain('Bot Configuration')
      expect(sendMessageCall).toContain('Memory Management')
      expect(sendMessageCall).toContain('Coin System')
      expect(sendMessageCall).toContain('/help')
      expect(sendMessageCall).toContain('/balance')
      expect(sendMessageCall).toContain('/image')
      expect(sendMessageCall).toContain('/buy')
    })

    describe('admin button functionality', () => {
      it('should show admin button when user is admin in group chat', async () => {
        const groupCtx = {
          ...ctx,
          chat: { id: 456, type: 'group' } as any
        }
        const mockAdminAuthService = {
          verifyAdminStatus: vi.fn().mockResolvedValue(true)
        }
        vi.mocked(AdminAuthService).mockImplementation(() => mockAdminAuthService as any)

        const handler = (bot as any).helpHandler
        await handler(groupCtx as Context)

        expect(AdminAuthService).toHaveBeenCalledWith(env, 'test-token')
        expect(mockAdminAuthService.verifyAdminStatus).toHaveBeenCalledWith(456, 123)
        const sendMessageCall = vi.mocked(groupCtx.telegram!.sendMessage).mock.calls[0]
        expect(sendMessageCall[2]).toHaveProperty('reply_markup')
        const replyMarkup = sendMessageCall[2]?.reply_markup as any
        expect(replyMarkup).toHaveProperty('inline_keyboard')
      })

      it('should show admin button when user is admin in supergroup chat', async () => {
        const supergroupCtx = {
          ...ctx,
          chat: { id: 456, type: 'supergroup' } as any
        }
        const mockAdminAuthService = {
          verifyAdminStatus: vi.fn().mockResolvedValue(true)
        }
        vi.mocked(AdminAuthService).mockImplementation(() => mockAdminAuthService as any)

        const handler = (bot as any).helpHandler
        await handler(supergroupCtx as Context)

        expect(mockAdminAuthService.verifyAdminStatus).toHaveBeenCalledWith(456, 123)
        const sendMessageCall = vi.mocked(supergroupCtx.telegram!.sendMessage).mock.calls[0]
        expect(sendMessageCall[2]).toHaveProperty('reply_markup')
      })

      it('should not show admin button when user is not admin', async () => {
        const groupCtx = {
          ...ctx,
          chat: { id: 456, type: 'group' } as any
        }
        const mockAdminAuthService = {
          verifyAdminStatus: vi.fn().mockResolvedValue(false)
        }
        vi.mocked(AdminAuthService).mockImplementation(() => mockAdminAuthService as any)

        const handler = (bot as any).helpHandler
        await handler(groupCtx as Context)

        expect(mockAdminAuthService.verifyAdminStatus).toHaveBeenCalledWith(456, 123)
        const sendMessageCall = vi.mocked(groupCtx.telegram!.sendMessage).mock.calls[0]
        const replyMarkup = sendMessageCall[2]?.reply_markup
        expect(replyMarkup).toBeUndefined()
      })

      it('should not show admin button in private chat', async () => {
        const privateCtx = {
          ...ctx,
          chat: { id: 456, type: 'private' } as any
        }

        const handler = (bot as any).helpHandler
        await handler(privateCtx as Context)

        expect(AdminAuthService).not.toHaveBeenCalled()
        const sendMessageCall = vi.mocked(privateCtx.telegram!.sendMessage).mock.calls[0]
        const replyMarkup = sendMessageCall[2]?.reply_markup
        expect(replyMarkup).toBeUndefined()
      })

      it('should not show admin button when env is not provided', async () => {
        const testBot = {
          command: vi.fn((command, handler) => {
            if (command === 'help') {
              ;(testBot as any).helpHandler = handler
            }
          })
        } as any

        const groupCtx = {
          ...ctx,
          chat: { id: 456, type: 'group' } as any
        }

        await help(testBot, sessionController, userService, undefined)
        const handler = (testBot as any).helpHandler
        await handler(groupCtx as Context)

        expect(AdminAuthService).not.toHaveBeenCalled()
      })

      it('should not show admin button when ctx.from is undefined', async () => {
        const groupCtx = {
          ...ctx,
          chat: { id: 456, type: 'group' } as any,
          from: undefined
        }
        const mockAdminAuthService = {
          verifyAdminStatus: vi.fn().mockResolvedValue(true)
        }
        vi.mocked(AdminAuthService).mockImplementation(() => mockAdminAuthService as any)

        const handler = (bot as any).helpHandler
        await handler(groupCtx as Context)

        expect(AdminAuthService).not.toHaveBeenCalled()
      })

      it('should handle admin status check errors gracefully', async () => {
        const groupCtx = {
          ...ctx,
          chat: { id: 456, type: 'group' } as any
        }
        const mockAdminAuthService = {
          verifyAdminStatus: vi.fn().mockRejectedValue(new Error('API error'))
        }
        vi.mocked(AdminAuthService).mockImplementation(() => mockAdminAuthService as any)

        const handler = (bot as any).helpHandler
        await handler(groupCtx as Context)

        expect(console.error).toHaveBeenCalledWith(
          'Error checking admin status:',
          expect.any(Error)
        )
        expect(ctx.telegram!.sendMessage).toHaveBeenCalled()
      })

      it('should include correct worker URL in admin button', async () => {
        const groupCtx = {
          ...ctx,
          chat: { id: 456, type: 'group' } as any
        }
        const mockAdminAuthService = {
          verifyAdminStatus: vi.fn().mockResolvedValue(true)
        }
        vi.mocked(AdminAuthService).mockImplementation(() => mockAdminAuthService as any)

        const handler = (bot as any).helpHandler
        await handler(groupCtx as Context)

        const sendMessageCall = vi.mocked(groupCtx.telegram!.sendMessage).mock.calls[0]
        const replyMarkup = sendMessageCall[2]?.reply_markup as any
        expect(replyMarkup).toBeDefined()
        const keyboard = replyMarkup.inline_keyboard[0][0]
        expect(keyboard.web_app.url).toContain('my-first-worker.damir-cy.workers.dev')
        expect(keyboard.web_app.url).toContain('/admin')
      })
    })
  })
})

