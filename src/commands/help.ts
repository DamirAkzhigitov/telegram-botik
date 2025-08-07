import { Context, Telegraf } from 'telegraf'

import { UserService } from '../service/UserService'

export function help(bot: Telegraf<Context<any>>, sessionController: any, userService?: UserService, env?: Env) {
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
        { parse_mode: 'Markdown' }
      )
    } catch (error) {
      console.error('Error help:', error)
    }
  })
}
