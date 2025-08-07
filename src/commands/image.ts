import { Context, Telegraf } from 'telegraf'
import { UserService } from '../service/UserService'

export function image(bot: Telegraf<Context<any>>, sessionController: any, userService?: UserService) {
  bot.command('image', async (ctx) => {
    try {
      if (!ctx.from) {
        return await ctx.reply('❌ Unable to identify user')
      }

      if (!userService) {
        return await ctx.reply('❌ User service not available')
      }

      // Check if user has enough coins (1 coin required)
      const hasEnoughCoins = await userService.hasEnoughCoins(ctx.from.id, 1)
      
      if (!hasEnoughCoins) {
        const currentBalance = await userService.getUserBalance(ctx.from.id)
        return await ctx.reply(
          `❌ Insufficient coins!\n\n` +
          `💰 Your current balance: **${currentBalance} coins**\n` +
          `🖼️ Image generation requires: **1 coin**\n\n` +
          `Please earn more coins to generate images.`,
          { parse_mode: 'Markdown' }
        )
      }

      // Deduct 1 coin from user's account
      const deductionSuccess = await userService.deductCoins(ctx.from.id, 1, 'image_generation')
      
      if (!deductionSuccess) {
        return await ctx.reply('❌ Failed to deduct coins. Please try again later.')
      }

      // Get updated balance
      const newBalance = await userService.getUserBalance(ctx.from.id)
      
      await ctx.reply(
        `✅ **1 coin deducted successfully!**\n\n` +
        `🖼️ Image generation request received\n` +
        `💰 Remaining balance: **${newBalance} coins**\n\n` +
        `*Image generation implementation will be added in a future update.*`,
        { parse_mode: 'Markdown' }
      )
    } catch (error) {
      console.error('Error in image command:', error)
      await ctx.reply('❌ Error processing image request. Please try again later.')
    }
  })
} 