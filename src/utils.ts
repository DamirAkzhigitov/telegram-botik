const getRandom = () => Math.round(Math.random() * 25000);

const delay = () => new Promise((resolve) => setTimeout(resolve, getRandom()));

async function generateAiResponse(ctx: any, gptApi: (val: any[]) => Promise<any>) {
	const recentHistory = ctx.session.conversationHistory.slice(-3);

	let botMind = '';

	if (Math.random() < 0.25) {
		await delay();

		botMind = await gptApi(recentHistory);
	}

	return botMind;
}

export { getRandom, delay, generateAiResponse };
