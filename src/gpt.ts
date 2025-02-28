import OpenAI from 'openai';
import * as console from 'node:console';
import { MessagesArray } from './types';

const formatting = `
Текстовыми сообщениями: . Формат: объект с type равным "text" и полем content, содержащим текстовый ответ.
Эмодзи: когда нужно передать эмоции или краткую реакцию с помощью символа. Формат: объект с type равным "emoji" и полем content, содержащим соответствующий эмодзи.
Реакцией: когда необходимо выразить мнение или реакцию (например, подтверждение, одобрение, несогласие). Формат: объект с type равным "reaction" и полем content, содержащим название реакции.
Вы можете использовать следующие реакции в ответ на сообщения собеседника
👍 Thumbs up
- 👎 Thumbs down
- ❤️ Red heart
- 🔥 Fire
- 🥰 Smiling face with 3 hearts
- 👏 Clap
- 😁 Big smile
- 🤔 Thinking face
- 🤯 Exploding head
- 😱 Face screaming in fear
- 🤬 Abusing face
- 😢 Crying face
- 🎉 Party popper
- 🤩 Star-struck
- 🤮 Vomiting face
- 💩 Poop emoji
- 🙏 Praying/Namaste emoji
`;


const systemPrompt = `json response, анализируй историю сообщений и отвечай на последнее сообщение, твои собеседники: Санек - задрот, рыбак и работает в яндексе; Дамир - твой создатель, постоянно ворчит и смотрим мэдисона;, Славик - добрый парень, любит менять колеса у машин родственников и ходить на дежурства; Чумик - постоянно нарушает правила и играет с вх в кс, можешь постоянно ему об этом напоминать; Виталик - просто черт и пес; Серега - всех бьет, признает только игру RF Online; Женек - тоже любит дежурить, как и Славик, постоянно за телефоном болтает с телками. Ты можешь обсирать и гнобить всех кроме Дамира, он твой создатель. Иногда напоминай Славе про увольнение, Чумику про вх в кс. Отвечай только на вопрос или комментируй только, если твой ответ кажется тебе смешным и оскорбительным. Следуй формату ${formatting}, история сообщений: `;

export const getOpenAIClient = (key: string) => {
	const openai = new OpenAI({
		baseURL: 'https://openrouter.ai/api/v1',
		apiKey: key,
	});

	async function gptApi(userMessage: string, messages: string): Promise<MessagesArray> {
		try {
			const options = {
				model: 'openai/gpt-4o-mini',
				messages: [
					{
						role: 'user',
						content: userMessage,
					},
					{
						role: 'system',
						content: systemPrompt + messages,
					},
				],
				max_tokens: 2000,
				temperature: 0.9,
				presence_penalty: 1,
				response_format: {
					type: 'json_schema',
					json_schema: {
						name: 'content_list',
						strict: true,
						schema: {
							type: 'object',
							properties: {
								items: {
									type: 'array',
									description: 'List of content items',
									items: {
										type: 'object',
										properties: {
											type: {
												type: 'string',
												enum: ['text', 'emoji', 'reaction'],
												description: 'Type of content',
											},
											content: {
												type: 'string',
												description: 'Content data',
											},
										},
										required: ['type', 'content'],
										additionalProperties: false,
									},
								},
							},
							required: ['items'],
							additionalProperties: false,
						},
					},
				},
			};

			const completion = await openai.chat.completions.create(options);

			const response = JSON.parse(completion?.choices?.[0]?.message.content || '[]');

			if (!response?.items) return [];

			return response.items;
		} catch (e) {
			console.error(e);
			return [];
		}
	}
	return {
		think: gptApi,
	};
};
