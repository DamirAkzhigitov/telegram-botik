// src/worker.ts
import { Telegraf } from 'telegraf';
import { getOpenAIClient } from './gpt';
import { message } from 'telegraf/filters';
import { generateAiResponse } from './utils';

interface ChatMessage {
	username: string;
	content: string;
	timestamp: number;
}

interface SessionData {
	userMessages: ChatMessage[];
}

export default {
	async fetch(request: Request, env: any): Promise<Response> {
		const gpt = getOpenAIClient(env.API_KEY);
		const bot = new Telegraf<any>(env.BOT_KEY, {
			telegram: { webhookReply: false },
		});

		// Получение истории сообщений для конкретного чата
		const getSession = async (chatId: number): Promise<SessionData> => {
			try {
				const data = await env.CHAT_SESSIONS_STORAGE.get(`session_${chatId}`);
				return data ? JSON.parse(data) : { userMessages: [] };
			} catch (e) {
				return { userMessages: [] };
			}
		};

		// Сохранение истории сообщений для конкретного чата
		const saveSession = async (chatId: number, session: SessionData) => {
			await env.CHAT_SESSIONS_STORAGE.put(
				`session_${chatId}`,
				JSON.stringify({
					...session,
					userMessages: session.userMessages.slice(-50), // Храним последние 50 сообщений
				}),
			);
		};

		bot.on(message('text'), async (ctx) => {
			try {
				if (!ctx.message?.text || ctx.message.from.is_bot) return;

				const username = ctx.message.from.username || ctx.message.from.first_name || 'Anonymous';

				const chatId = ctx.chat.id;
				const userMessage = ctx.message.text;

				const sessionData = await getSession(chatId);

				const newMessage: ChatMessage = {
					username,
					content: userMessage,
					timestamp: Date.now(),
				};

				const updatedMessages = [...sessionData.userMessages, newMessage];

				await saveSession(chatId, { userMessages: updatedMessages });

				const recentMessages = updatedMessages
					.slice(-10)
					.map((m) => `${m.username}: ${m.content}`)
					.join('\n');

				const botMind = await generateAiResponse(recentMessages, gpt.think);

				if (botMind) await ctx.telegram.sendMessage(chatId, botMind);

			} catch (error) {
				console.error('Error processing message:', error);
			}
		});

		return handleUpdate(request, bot);
	},
};

async function handleUpdate(request: Request, bot: Telegraf) {
	if (request.method === 'POST') {
		try {
			const update = await request.json();
			await bot.handleUpdate(update);
			return new Response('OK');
		} catch (error) {
			return new Response('Invalid request', { status: 400 });
		}
	}
	return new Response('Method Not Allowed', { status: 405 });
}
