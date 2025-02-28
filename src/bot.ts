import { getOpenAIClient } from './gpt';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { delay, generateAiResponse, replyWithSticker } from './utils';
import { ChatMessage, SessionData } from './types';

const botName = '@nairbru007bot';

export const createBot = async (env: { API_KEY: string; BOT_KEY: string; CHAT_SESSIONS_STORAGE: any }, webhookReply = false) => {
	const gpt = getOpenAIClient(env.API_KEY);
	const bot = new Telegraf(env.BOT_KEY, {
		telegram: { webhookReply },
	});

	const getSession = async (chatId: number): Promise<SessionData> => {
		try {
			const data = await env.CHAT_SESSIONS_STORAGE.get(`session_${chatId}`);
			return data ? JSON.parse(data) : { userMessages: [] };
		} catch (e) {
			return { userMessages: [] };
		}
	};

	const saveSession = async (chatId: number, session: SessionData) => {
		await env.CHAT_SESSIONS_STORAGE.put(
			`session_${chatId}`,
			JSON.stringify({
				...session,
				userMessages: session.userMessages.slice(-50), // Храним последние 50 сообщений
			}),
		);
	};

	bot.command('set_prompt', async (ctx) => {
		try {
			const chatId = ctx.chat.id;
			const userMessage = ctx.message.text || '';

			const newPrompt = userMessage.replace('/set_prompt', '').trim();

			await savePrompt(chatId, newPrompt);

			await ctx.telegram.sendMessage(chatId, 'Системный промт обновлен!');
		} catch (error) {
			console.error('Error updating prompt:', error);
		}
	});

	// New function to save and load user prompts
	const savePrompt = async (chatId: number, prompt: string) => {
		await env.CHAT_SESSIONS_STORAGE.put(`prompt_${chatId}`, prompt);
	};

	const getPrompt = async (chatId: number): Promise<string> => {
		return (await env.CHAT_SESSIONS_STORAGE.get(`prompt_${chatId}`)) || '';
	};

	bot.on(message(), async (ctx) => {
		try {
			if (ctx.message.from.is_bot) return;

			const username = ctx.message.from.first_name || ctx.message.from.last_name || ctx.message.from.username || 'Anonymous';

			const chatId = ctx.chat.id;
			const userMessage = ('text' in ctx.message && ctx.message.text) || '';

			const sessionData = await getSession(chatId);

			const newMessage: ChatMessage = {
				username,
				content: userMessage,
				timestamp: Date.now(),
			};

			const recentMessages = [...sessionData.userMessages]
				.slice(-10)
				.map((m) => `${m.username}: ${m.content};`)
				.reverse()
				.join(';');

			const customPrompt = await getPrompt(chatId);

			const botMind = await generateAiResponse(
				`Пользователь ${newMessage.username} написал: ${newMessage.content}`,
				recentMessages,
				gpt.think,
				customPrompt,
				!!userMessage.match(botName),
			);

			await saveSession(chatId, { userMessages: [...sessionData.userMessages, newMessage] });

			if (botMind.length) {
				await delay();

				botMind.forEach(({ content, type }) => {
					if (type === 'emoji') {
						replyWithSticker(ctx, content);
					} else if (type === 'text') {
						ctx.telegram.sendMessage(chatId, content);
					} else if (type === 'reaction') {
						ctx.telegram.setMessageReaction(chatId, ctx.message.message_id, [
							{
								type: 'emoji',
								emoji: content,
							},
						]);
					}
				});

				await ctx.telegram.sendChatAction(chatId, 'typing');
			}
		} catch (error) {
			console.error('Error processing message:', error);
		}
	});

	return bot;
};
