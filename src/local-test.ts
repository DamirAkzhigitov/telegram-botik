import { createBot } from './bot';

const bot = await createBot({
	API_KEY: process.env.API_KEY!,
	BOT_KEY: process.env.BOT_KEY!,
	CHAT_SESSIONS_STORAGE: {
		put: () => {},
		get: () => {},
	},
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
