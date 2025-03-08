import { Sticker } from './types'

const delay = () => new Promise((resolve) => setTimeout(resolve, 5000))

const getRandomValueArr = <T>(arr: T[]): T => {
  return arr[Math.floor(Math.random() * arr.length)]
}

const findByEmoji = (stickers: Sticker[], emoji: string): Sticker => {
  return (
    stickers.find((sticker) => sticker.emoji === emoji) ||
    getRandomValueArr(stickers)
  )
}

const isReply = (chance: string) => Math.random() < Number(chance)

export { delay, isReply, getRandomValueArr, findByEmoji }
