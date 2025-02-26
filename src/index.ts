import { Telegraf } from 'telegraf';
import { createBot } from './bot';

export default {
	async fetch(request: Request, env: any): Promise<Response> {
		const bot = await createBot(env)
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
