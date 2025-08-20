import { Context, Telegraf } from 'telegraf'
import { UserService } from '../service/UserService'

export function buy(
  bot: Telegraf<Context<any>>,
  sessionController: any,
  userService?: UserService
) {
  bot.command('buy', async (ctx) => {
    try {
      if (!ctx.from) {
        return await ctx.reply('❌ Не удалось идентифицировать пользователя')
      }

      if (!userService) {
        return await ctx.reply('❌ Сервис пользователей недоступен')
      }

      // Get the amount from command arguments
      const args = ctx.message.text.split(' ')
      if (args.length !== 2) {
        return await ctx.reply(
          `❌ **Неверный формат команды!**\n\n` +
            `📝 **Использование:** /buy <количество>\n` +
            `💡 **Пример:** /buy 10\n\n` +
            `💰 **Цены:**\n` +
            `• 1 монета = ₽10 RUB\n` +
            `• Минимальная покупка: 5 монет\n` +
            `• Максимальная покупка: 1000 монет`,
          { parse_mode: 'Markdown' }
        )
      }

      const amount = parseInt(args[1])

      // Validate amount
      if (isNaN(amount) || amount < 5 || amount > 1000) {
        return await ctx.reply(
          `❌ **Неверное количество!**\n\n` +
            `💰 **Допустимый диапазон:** 5 - 1000 монет\n` +
            `💡 **Пример:** /buy 10`,
          { parse_mode: 'Markdown' }
        )
      }

      // Calculate payment amount (1 coin = $10 RUB)
      const paymentAmount = (amount * 10).toFixed(2)

      // Generate a unique payment link (placeholder for now)
      const paymentId = `pay_${ctx.from.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const paymentLink = `https://your-payment-gateway.com/pay/${paymentId}`

      // Store pending purchase in database
      const pendingPurchaseCreated = await userService.createPendingPurchase(
        ctx.from.id,
        amount,
        paymentId
      )

      if (!pendingPurchaseCreated) {
        return await ctx.reply(
          '❌ Ошибка создания запроса на покупку. Пожалуйста, попробуйте позже.'
        )
      }

      await ctx.reply(
        `🛒 **Запрос на покупку создан!**\n\n` +
          `💰 **Монет для покупки:** ${amount} монет\n` +
          `💵 **Сумма к оплате:** ₽${paymentAmount} RUB\n` +
          `🔗 **Ссылка для оплаты:** [Нажмите здесь для оплаты](${paymentLink})\n\n` +
          `📋 **ID платежа:** \`${paymentId}\`\n\n` +
          `⚠️ **Важно:**\n` +
          `• Завершите оплату, чтобы получить монеты\n` +
          `• Монеты будут добавлены автоматически после подтверждения оплаты\n` +
          `• Обратитесь в поддержку, если возникнут проблемы\n\n` +
          `💡 **Нужна помощь?** Используйте /help для получения дополнительной информации.`,
        {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        }
      )
    } catch (error) {
      console.error('Error in buy command:', error)
      await ctx.reply(
        '❌ Ошибка обработки запроса на покупку. Пожалуйста, попробуйте позже.'
      )
    }
  })
}
