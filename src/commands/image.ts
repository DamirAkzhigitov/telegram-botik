import { Context, Telegraf } from 'telegraf'
import { UserService } from '../service/UserService'
import OpenAI from 'openai'

export function image(
  bot: Telegraf<Context<any>>,
  sessionController: any,
  userService?: UserService,
  env?: Env
) {
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

      // Get the text after /image command
      const commandText = ctx.message.text
      const prompt = commandText.replace(/^\/image\s*/, '').trim()

      if (!prompt) {
        return await ctx.reply(
          `❌ Пожалуйста, укажите описание изображения!\n\n` +
            `Пример: \`/image серая кошка обнимает выдру с оранжевым шарфом\``,
          { parse_mode: 'Markdown' }
        )
      }

      if (!env?.API_KEY) {
        return await ctx.reply(
          '❌ OpenAI API ключ не настроен. Пожалуйста, обратитесь к администратору.'
        )
      }

      // Initialize OpenAI client
      const openai = new OpenAI({
        apiKey: env.API_KEY
      })

      // Step 1: Moderation check
      await ctx.reply('🔍 Проверяю содержимое запроса...')

      const moderation = await openai.moderations.create({
        model: 'omni-moderation-latest',
        input: prompt
      })

      const moderationResult = moderation.results[0]

      if (moderationResult.flagged) {
        return await ctx.reply(
          '❌ Ваш запрос содержит неприемлемый контент и не может быть обработан.\n\n' +
            'Пожалуйста, измените описание изображения и попробуйте снова.'
        )
      }

      // Step 2: Deduct coins after moderation passes
      const deductionSuccess = await userService.deductCoins(
        ctx.from.id,
        1,
        'image_generation'
      )

      if (!deductionSuccess) {
        return await ctx.reply(
          '❌ Не удалось списать монеты. Пожалуйста, попробуйте позже.'
        )
      }

      // Get updated balance
      const newBalance = await userService.getUserBalance(ctx.from.id)

      // Step 3: Generate image
      await ctx.reply('🎨 Генерирую изображение...')

      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt,
        response_format: 'b64_json',
        size: '1024x1024'
      })

      // Extract image data from response
      const imageData = response.data[0]
      
      if (!imageData?.b64_json) {
        // Refund the coin if image generation failed
        await userService.addCoins(ctx.from.id, 1, 'image_generation_refund')
        return await ctx.reply(
          '❌ Не удалось сгенерировать изображение.\n\n' +
            'Монета была возвращена на ваш счет. Пожалуйста, попробуйте позже.'
        )
      }

      // Convert base64 to buffer
      const imageBytes = Buffer.from(imageData.b64_json, 'base64')

      // Step 4: Send the generated image to user
      await ctx.replyWithPhoto(
        { source: imageBytes },
        {
          caption:
            `🖼️ **Изображение сгенерировано!**\n\n` +
            `📝 Запрос: "${prompt}"\n` +
            `💰 Списано: **1 монета**\n` +
            `💳 Оставшийся баланс: **${newBalance} монет**`,
          parse_mode: 'Markdown'
        }
      )
    } catch (error) {
      console.error('Error in image command:', error)

      // Try to refund the coin if there was an error
      if (ctx.from && userService) {
        try {
          await userService.addCoins(
            ctx.from.id,
            1,
            'image_generation_error_refund'
          )
        } catch (refundError) {
          console.error('Failed to refund coin after error:', refundError)
        }
      }

      await ctx.reply(
        '❌ Ошибка обработки запроса на изображение. Пожалуйста, попробуйте позже.'
      )
    }
  })
}
