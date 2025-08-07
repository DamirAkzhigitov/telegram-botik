import { Context, Telegraf } from 'telegraf'
import { UserService } from '../service/UserService'

export function balance(bot: Telegraf<Context<any>>, sessionController: any, userService?: UserService) {
  bot.command('balance', async (ctx) => {
    try {
      if (!ctx.from) {
        return await ctx.reply('❌ Unable to identify user')
      }

      if (!userService) {
        return await ctx.reply('❌ User service not available')
      }

      const balance = await userService.getUserBalance(ctx.from.id)
      
      await ctx.reply(
        `💰 Your current balance: **${balance} coins**\n\n` +
        `Use /help to see available commands and their costs.`,
        { parse_mode: 'Markdown' }
      )
    } catch (error) {
      console.error('Error in balance command:', error)
      await ctx.reply('❌ Error retrieving balance. Please try again later.')
    }
  })
} 