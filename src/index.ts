import { session, Telegraf } from 'telegraf';
import { getOpenAIClient } from './gpt';
import { message } from 'telegraf/filters';
import { generateAiResponse } from './utils';

export default {
	async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
		const gpt = getOpenAIClient(env.API_KEY);
		const bot = new Telegraf<any>(env.BOT_KEY, {
			telegram: { webhookReply: false },
		});

		bot.use(
			session({
				defaultSession: () => ({
					conversationHistory: [],
				}),
			}),
		);

		bot.on(message('text'), async (ctx) => {
			if (!ctx.message?.text || ctx.message.from.is_bot) return;

			const userId = ctx.message.from.id.toString();
			const userMessage = ctx.message.text;

			ctx.session.conversationHistory.push({
				role: 'user',
				content: userMessage,
				name: userId,
			});

			const botMind = await generateAiResponse(ctx, gpt.think);

			console.log('botMind: ', botMind);

			if (botMind) {
				await ctx.telegram.sendMessage(ctx.message.chat.id, botMind);
			}
		});

		return handleUpdate(request, bot);
	},
};

async function handleUpdate(request: Request, bot: Telegraf) {
	if (request.method === 'POST') {
		const update = await request.json();
		await bot.handleUpdate(update);
		return new Response('OK');
	}
	return new Response('Method Not Allowed', { status: 405 });
}
