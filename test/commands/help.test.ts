import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Context, Telegraf } from 'telegraf'
import { help } from '../../src/commands/help'
import type { UserService } from '../../src/service/UserService'

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

    env = {}

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
        { parse_mode: 'Markdown' }
      )
      expect(ctx.telegram!.sendMessage).toHaveBeenCalledWith(
        456,
        expect.stringContaining('100 coins'),
        { parse_mode: 'Markdown' }
      )
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
        { parse_mode: 'Markdown' }
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
  })
})

