import { getOpenAIClient } from './gpt'
import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import { delay, isReply, replyWithSticker } from './utils'
import { ChatMessage, Context } from './types'
import { SessionController } from './service/SessionController'

const botName = '@nairbru007bot'

export const createBot = async (env: Context, webhookReply = false) => {
	const { openAi } = getOpenAIClient(env.API_KEY)
	const bot = new Telegraf(env.BOT_KEY, {
		telegram: { webhookReply },
	})
	const sessionController = new SessionController(env)

	bot.command('prompt', async (ctx) => {
		try {
			const chatId = ctx.chat.id
			const userMessage = ctx.message.text || ''

			const newPrompt = userMessage.replace('/set_prompt', '').trim()

			await sessionController.updateSession(chatId, {
				prompt: newPrompt,
			})

			await ctx.telegram.sendMessage(chatId, 'Системный промт обновлен!')
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

			if (!shouldReply && !isMessageToBot && !isPrivate) {
				return
			}

			const sessionData = await sessionController.getSession(String(chatId))
			const currentTime = new Date()

			const newMessage: ChatMessage = {
				name: username,
				text: userMessage,
				time: currentTime.toISOString(),
			}

			const recentMessages = [...sessionData.userMessages]
				.map((m) => `${m.name}: ${m.text};`)
				.reverse()
				.join(';')

			const botMessages = await openAi(
				`${newMessage.name} написал: ${newMessage.text}`,
				recentMessages,
				sessionData.prompt,
			)

			await sessionController.updateSession(chatId, {
				userMessages: [...sessionData.userMessages, newMessage],
			})

			const asyncActions = botMessages.map(({ content, type }) => {
				if (type === 'emoji') {
					return replyWithSticker(ctx, content)
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
