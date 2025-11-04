import { Context, Telegraf } from 'telegraf'
import { InlineKeyboardButton } from 'telegraf/types'
import { UserService } from '../service/UserService'
import { AdminAuthService } from '../service/AdminAuthService'
import type { SessionController } from '../service/SessionController'

function getWorkerUrl(): string {
  // Try to get from env variable, otherwise construct from worker name
  // In production, this should be set as an environment variable
  // For now, use a default pattern - this should be configured per environment
  const workerName = 'my-first-worker'
  const subdomain = 'damir-cy.workers.dev' // Update this to match your actual subdomain
  return `https://${workerName}.${subdomain}`
}

export function help(
  bot: Telegraf<Context>,
  _sessionController: SessionController,
  userService?: UserService,
  env?: Env
) {
  bot.command('help', async (ctx) => {
    try {
      let balanceInfo = ''

      if (userService && ctx.from) {
        try {
          const balance = await userService.getUserBalance(ctx.from.id)
          balanceInfo = `\n💰 Your current balance: **${balance} coins**\n`
        } catch (error) {
          console.error('Error getting balance for help:', error)
        }
      }

      // Check if user is admin in this chat (if it's a group)
      let showAdminButton = false
      if (
        ctx.chat &&
        (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') &&
        env &&
        ctx.from
      ) {
        try {
          const adminAuthService = new AdminAuthService(env, env.BOT_TOKEN)
          showAdminButton = await adminAuthService.verifyAdminStatus(
            ctx.chat.id,
            ctx.from.id
          )
        } catch (error) {
          console.error('Error checking admin status:', error)
        }
      }

      const keyboard: InlineKeyboardButton[][] = []

      if (showAdminButton) {
        const workerUrl = getWorkerUrl()
        keyboard.push([
          {
            text: '🔧 Open Admin Panel',
            web_app: { url: `${workerUrl}/admin` }
          } as InlineKeyboardButton
        ])
      }

      await ctx.telegram.sendMessage(
        ctx.chat.id,
        `
🤖 **Available Commands**${balanceInfo}

**General Commands:**
/help — Show this help message
/balance — Check your coin balance
/image — Generate an image (costs 1 coin)
/buy <amount> — Purchase coins (min: 5, max: 1000)

**Bot Configuration:**
/set_new_prompt — Set new bot prompt
/add_sticker_pack — Add new sticker pack
/reset_sticker_pack — Reset current sticker pack
/set_reply_chance — Set bot reply probability
/get_prompt — Show current prompt

**Memory Management:**
/show_memories — Show saved chat information
/clear_memories — Clear all saved chat data
/clear_messages — Clear message history

**Coin System:**
• New users get 5 coins upon first interaction
• Image generation costs 1 coin
• Purchase more coins with /buy <amount>
• Check your balance with /balance
				`,
        {
          parse_mode: 'Markdown',
          reply_markup:
            keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined
        }
      )
    } catch (error) {
      console.error('Error help:', error)
    }
  })
}
