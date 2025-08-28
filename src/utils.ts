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

function base64ToBlob(b64: string, type: string) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

export { delay, isReply, getRandomValueArr, findByEmoji, base64ToBlob }
