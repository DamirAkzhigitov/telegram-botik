import { Sticker } from './types';

const getRandom = () => Math.round(Math.random() * 25000);

const delay = () => new Promise((resolve) => setTimeout(resolve, getRandom()));

const isEmoji = (str: string) => /\p{Emoji}/u.test(str);

async function generateAiResponse(messages: string, gptApi: (val: string) => Promise<any>, force = false) {
	let botMind = '';

	if (Math.random() < 0.25 && messages || force) {
		botMind = await gptApi(messages);
	}

	return botMind.trim();
}

const stikersSet = ['spichtyan_by_TgEmodziBot', 'primates_uffchat', 'sad_crying_cat', 'Kekisy3', 'ne_trogat_stikosi_lyunishki_by_fStikBot', 'Kakloschweine']
const loadedStickers: {[key: string]: Sticker[]} = {}

const getRandomValueArr = <T>(arr: T[]): T => {
	return arr[Math.floor(Math.random() * arr.length)];
}

const setLoadedStickers = (setName: string, stikers: Sticker[]) => {
	loadedStickers[setName] = stikers;
}

const findByEmoji = (stickers: Sticker[], emoji: string):Sticker => {
	return stickers.find((sticker) => sticker.emoji === emoji) || getRandomValueArr(stickers)
}

const getCachedValue = (stickerPack: string) => {
	if (stickerPack in loadedStickers) {
		return loadedStickers[stickerPack];
	} else {
		return null
	}
}

const replyWithSticker = async (ctx:any, emoji: string) => {
	const stickerSet = getRandomValueArr(stikersSet)
	let stickers: Sticker[] = []
	const cachedValue = getCachedValue(stickerSet)

	if (cachedValue) {
		stickers = cachedValue
	} else {
		const response = await ctx.telegram.getStickerSet(stickerSet)
		stickers = response.stickers as Sticker[]
		setLoadedStickers(stickerSet, stickers)
	}

	const stickerByEmoji = findByEmoji(stickers, emoji)

	await ctx.telegram.sendSticker(ctx.chat.id, stickerByEmoji.file_id)
}

export { getRandom, delay, generateAiResponse, replyWithSticker, isEmoji };
