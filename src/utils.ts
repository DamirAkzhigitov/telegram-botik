const getRandom = () => Math.round(Math.random() * 25000);

const delay = () => new Promise((resolve) => setTimeout(resolve, getRandom()));

async function generateAiResponse(messages: string, gptApi: (val: string) => Promise<any>) {
	let botMind = '';

	if (Math.random() < 0.25 && messages) {
		botMind = await gptApi(messages);

		await delay();
	}

	return botMind;
}

export { getRandom, delay, generateAiResponse };
