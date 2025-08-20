import { Context, Telegraf } from 'telegraf'
import { UserService } from '../service/UserService'

// List of admin Telegram IDs who can use this command
const ADMIN_IDS = [123456789] // Replace with actual admin Telegram IDs

export function fixBalances(bot: Telegraf<Context<any>>, sessionController: any, userService?: UserService, env?: Env) {
  bot.command('fixbalances', async (ctx) => {
    try {
      if (!ctx.from) {
        return await ctx.reply('❌ Unable to identify user')
      }

      // Check if user is admin
      if (!ADMIN_IDS.includes(ctx.from.id)) {
        return await ctx.reply('❌ You do not have permission to use this command')
      }

      if (!userService) {
        return await ctx.reply('❌ User service not available')
      }

      await ctx.reply('🔄 Starting balance fix process...')

      // Get all users with 0 coins
      const usersWithZeroCoins = await env.DB
        .prepare('SELECT * FROM users WHERE coins = 0')
        .all()

      if (usersWithZeroCoins.results.length === 0) {
        return await ctx.reply('✅ No users with 0 coins found. All users have proper balances.')
      }

      let fixedCount = 0
      for (const user of usersWithZeroCoins.results) {
        // Update user balance
        await env.DB
          .prepare('UPDATE users SET coins = 5, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(user.id)
          .run()

        // Log the transaction
        await env.DB
          .prepare(
            'INSERT INTO transactions (user_id, action_type, coins_change, balance_before, balance_after) VALUES (?, ?, ?, ?, ?)'
          )
          .bind(user.id, 'balance_fix', 5, 0, 5)
          .run()

        fixedCount++
      }

      await ctx.reply(
        `✅ Successfully fixed ${fixedCount} users with 0 coins.\n` +
        `All affected users now have 5 coins.`
      )

    } catch (error) {
      console.error('Error in fixbalances command:', error)
      await ctx.reply('❌ Error fixing balances. Please try again later.')
    }
  })
} 