import { MessagesArray, Sticker } from './types';

const delay = () => new Promise((resolve) => setTimeout(resolve, 5000));

async function generateAiResponse(
	userMessage: string,
	messages: string,
	gptApi: (val: string, valb: string) => Promise<MessagesArray>,
	force = false,
) {
	const botMind: MessagesArray = [];

	if ((Math.random() < 0.05 && messages) || force) {
		const response = await gptApi(userMessage, messages);

		botMind.push(...response);
	}

	return botMind;
}
//'spichtyan_by_TgEmodziBot', 'primates_uffchat', 'sad_crying_cat', 'Kekisy3', 'ne_trogat_stikosi_lyunishki_by_fStikBot', 'gufenpchela', 'stickersbredmini',
const stikersSet = ['kreksshpeks'];
const loadedStickers: { [key: string]: Sticker[] } = {};

const getRandomValueArr = <T>(arr: T[]): T => {
	return arr[Math.floor(Math.random() * arr.length)];
};

const setLoadedStickers = (setName: string, stikers: Sticker[]) => {
	loadedStickers[setName] = stikers;
};

const findByEmoji = (stickers: Sticker[], emoji: string): Sticker => {
	return stickers.find((sticker) => sticker.emoji === emoji) || getRandomValueArr(stickers);
};

const getCachedValue = (stickerPack: string) => {
	if (stickerPack in loadedStickers) {
		return loadedStickers[stickerPack];
	} else {
		return null;
	}
};

const replyWithSticker = async (ctx: any, emoji: string) => {
	const stickerSet = getRandomValueArr(stikersSet);
	let stickers: Sticker[] = [];
	const cachedValue = getCachedValue(stickerSet);

	if (cachedValue) {
		stickers = cachedValue;
	} else {
		const response = await ctx.telegram.getStickerSet(stickerSet);
		stickers = response.stickers as Sticker[];
		setLoadedStickers(stickerSet, stickers);
	}

	const stickerByEmoji = findByEmoji(stickers, emoji);

	await ctx.telegram.sendSticker(ctx.chat.id, stickerByEmoji.file_id);
};

export { delay, generateAiResponse, replyWithSticker };
