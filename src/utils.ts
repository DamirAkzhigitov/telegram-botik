import { Sticker } from './types'

const delay = () => new Promise((resolve) => setTimeout(resolve, 5000))

const stikersSet = ['kreksshpeks']
const loadedStickers: { [key: string]: Sticker[] } = {}

const getRandomValueArr = <T>(arr: T[]): T => {
	return arr[Math.floor(Math.random() * arr.length)]
}

const setLoadedStickers = (setName: string, stikers: Sticker[]) => {
	loadedStickers[setName] = stikers
}

const findByEmoji = (stickers: Sticker[], emoji: string): Sticker => {
	return (
		stickers.find((sticker) => sticker.emoji === emoji) ||
		getRandomValueArr(stickers)
	)
}

const getCachedValue = (stickerPack: string) => {
	if (stickerPack in loadedStickers) {
		return loadedStickers[stickerPack]
	} else {
		return null
	}
}

const replyWithSticker = async (ctx: any, emoji: string) => {
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

const isReply = () => Math.random() < 0.05

export { delay, replyWithSticker, isReply }
