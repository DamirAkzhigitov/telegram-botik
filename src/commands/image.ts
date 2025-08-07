import { Context, Telegraf } from 'telegraf'
import { UserService } from '../service/UserService'

export function image(bot: Telegraf<Context<any>>, sessionController: any, userService?: UserService) {
  bot.command('image', async (ctx) => {
    try {
      if (!ctx.from) {
        return await ctx.reply('❌ Не удалось идентифицировать пользователя')
      }

      if (!userService) {
        return await ctx.reply('❌ Сервис пользователей недоступен')
      }

      // Check if user has enough coins (1 coin required)
      const hasEnoughCoins = await userService.hasEnoughCoins(ctx.from.id, 1)
      
      if (!hasEnoughCoins) {
        const currentBalance = await userService.getUserBalance(ctx.from.id)
        return await ctx.reply(
          `❌ Недостаточно монет!\n\n` +
          `💰 Ваш текущий баланс: **${currentBalance} монет**\n` +
          `🖼️ Генерация изображения требует: **1 монету**\n\n` +
          `Пожалуйста, заработайте больше монет для генерации изображений.`,
          { parse_mode: 'Markdown' }
        )
      }

      // Deduct 1 coin from user's account
      const deductionSuccess = await userService.deductCoins(ctx.from.id, 1, 'image_generation')
      
      if (!deductionSuccess) {
        return await ctx.reply('❌ Не удалось списать монеты. Пожалуйста, попробуйте позже.')
      }

      // Get updated balance
      const newBalance = await userService.getUserBalance(ctx.from.id)
      
      await ctx.reply(
        `✅ **1 монета успешно списана!**\n\n` +
        `🖼️ Запрос на генерацию изображения получен\n` +
        `💰 Оставшийся баланс: **${newBalance} монет**\n\n` +
        `*Реализация генерации изображений будет добавлена в будущем обновлении.*`,
        { parse_mode: 'Markdown' }
      )
    } catch (error) {
      console.error('Error in image command:', error)
      await ctx.reply('❌ Ошибка обработки запроса на изображение. Пожалуйста, попробуйте позже.')
    }
  })
} 