import { getOpenAIClient } from './gpt'
import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import { delay, findByEmoji, getRandomValueArr, isReply } from './utils'
import { ChatMessage, Context, Sticker } from './types'
import { SessionController } from './service/SessionController'

const botName = '@nairbru007bot'

export const createBot = async (env: Context, webhookReply = false) => {
	const { openAi } = getOpenAIClient(env.API_KEY)
	const bot = new Telegraf(env.BOT_KEY, {
		telegram: { webhookReply },
	})

	const sessionController = new SessionController(env)

	bot.command('reset_sticker_pack', async (ctx) => {
		try {
			await sessionController.getSession(ctx.chat.id)

			await sessionController.resetStickers(ctx.chat.id)

			await ctx.telegram.sendMessage(
				ctx.chat.id,
				'Стикер пак обновлен до стандартного',
			)
		} catch (error) {
			console.error('Error updating prompt:', error)
		}
	})

	bot.command('add_sticker_pack', async (ctx) => {
		try {
			await sessionController.getSession(ctx.chat.id)

			await sessionController.updateSession(ctx.chat.id, {
				stickerNotSet: true,
			})

			await ctx.telegram.sendMessage(
				ctx.chat.id,
				'В следующем сообщении отправьте стикер который я должен использовать',
			)
		} catch (error) {
			console.error('Error updating prompt:', error)
		}
	})

	bot.command('set_new_prompt', async (ctx) => {
		try {
			await sessionController.getSession(ctx.chat.id)

			await sessionController.updateSession(ctx.chat.id, {
				promptNotSet: true,
			})

			await ctx.telegram.sendMessage(
				ctx.chat.id,
				'В следующем сообщении отправьте системный промпт',
			)
		} catch (error) {
			console.error('Error updating prompt:', error)
		}
	})

	bot.on(message(), async (ctx) => {
		try {
			if (ctx.message.from.is_bot) return

			const username =
				ctx.message.from.first_name ||
				ctx.message.from.last_name ||
				ctx.message.from.username ||
				'Anonymous'

			const chatId = ctx.chat.id
			const userMessage = ('text' in ctx.message && ctx.message.text) || ''
			const isPrivate = (ctx.chat.type = 'private')
			const isMessageToBot = !!userMessage.match(botName)
			const shouldReply = isReply()

			const sessionData = await sessionController.getSession(chatId)

			if (sessionData.firstTime) {
				await sessionController.updateSession(chatId, {
					firstTime: false,
				})
				await ctx.telegram.sendMessage(
					chatId,
					`Привет, спасибо добавили меня в чат, я всегда отвечаю если вы упоминаете меня в сообщениях, а так же при любых других сообщениях с 5% шансом, для того что бы узнать команды введите /help`,
				)
			}

			if (sessionData.promptNotSet) {
				console.log('ctx.message; ', ctx.message)
				await sessionController.updateSession(chatId, {
					prompt: userMessage,
					promptNotSet: false,
				})
				return await ctx.telegram.sendMessage(
					chatId,
					'Системный промт обновлен!',
				)
			}

			if (sessionData.stickerNotSet) {
				if ('sticker' in ctx.message && ctx.message.sticker?.set_name) {
					const onlyDefault = sessionController.isOnlyDefaultStickerPack()

					await sessionController.updateSession(chatId, {
						stickersPacks: [
							...(onlyDefault ? [] : sessionData.stickersPacks),
							ctx.message.sticker.set_name,
						],
						stickerNotSet: false,
					})

					await ctx.telegram.sendMessage(chatId, 'Стикер пак был добавлен!')

					return
				} else {
					return await ctx.telegram.sendMessage(chatId, 'Это был не стикер 😡')
				}
			}

			if (!shouldReply && !isMessageToBot && !isPrivate) return

			const currentTime = new Date()

			const newMessage: ChatMessage = {
				name: username,
				text: userMessage,
				time: currentTime.toISOString(),
			}

			const recentMessages = [...sessionData.userMessages]
				.map((m) => `${m.name}[${m.time}]: ${m.text};`)
				.reverse()
				.join(';')

			const botMessages = await openAi(
				`${newMessage.name}[${newMessage.time}] написал: ${newMessage.text}`,
				recentMessages,
				sessionData.prompt,
			)

			await sessionController.updateSession(chatId, {
				userMessages: [...sessionData.userMessages, newMessage],
			})

			const asyncActions = botMessages.map(async ({ content, type }) => {
				if (type === 'emoji') {
					const stickerSet = getRandomValueArr(sessionData.stickersPacks)
					const response = await ctx.telegram.getStickerSet(stickerSet)
					const stickerByEmoji = findByEmoji(
						response.stickers as Sticker[],
						content,
					)

					return ctx.telegram.sendSticker(ctx.chat.id, stickerByEmoji.file_id)
				} else if (type === 'text') {
					return ctx.telegram.sendMessage(chatId, content)
				} else if (type === 'reaction') {
					return ctx.telegram.setMessageReaction(
						chatId,
						ctx.message.message_id,
						[
							{
								type: 'emoji',
								emoji: content,
							},
						],
					)
				}
			})

			await Promise.all([
				ctx.telegram.sendChatAction(chatId, 'typing'),
				delay,
				...asyncActions,
			])
		} catch (error) {
			console.error('Error processing message:', error)
		}
	})

	return bot
}
