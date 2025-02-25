const getRandom = () => Math.round(Math.random() * 25000);

const delay = () => new Promise((resolve) => setTimeout(resolve, getRandom()));

async function generateAiResponse(ctx: any, gptApi: (val: any[]) => Promise<any>) {
	console.log('ctx.session.conversationHistory: ', ctx.session.conversationHistory);

	const recentHistory = ctx.session.conversationHistory.slice(-3);

	console.log('recentHistory: ', recentHistory);

	let botMind = '';

	if (Math.random() < 0.25 && !recentHistory?.length) {
		await delay();

		botMind = await gptApi(recentHistory);
	}

	return botMind;
}

export { getRandom, delay, generateAiResponse };
