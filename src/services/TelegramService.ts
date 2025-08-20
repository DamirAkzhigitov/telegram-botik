import axios from 'axios'
import { Context, Telegraf } from 'telegraf'
import { PhotoSize, Sticker } from 'telegraf/types'
import { findByEmoji, getRandomValueArr } from '../utils'

export const createTelegramService = (bot: Telegraf<Context>, botToken: string) => {
  const instance = axios.create({
    baseURL: 'https://api.telegram.org/',
    timeout: 1000
  })

  const getPhotoUrl = async (photoSizes: PhotoSize[]): Promise<string> => {
    const photo = photoSizes[photoSizes.length - 1] // Get the highest resolution
    const file = await bot.telegram.getFile(photo.file_id)
    return `file/bot${botToken}/${file.file_path}`
  }

  const getPhotoBase64 = async (photoSizes: PhotoSize[]): Promise<string> => {
    try {
      const downloadLink = await getPhotoUrl(photoSizes)
      const response = await instance.get(downloadLink, {
        responseType: 'arraybuffer'
      })
      const base64Image = Buffer.from(response.data).toString('base64')
      return `data:image/jpeg;base64,${base64Image}`
    } catch (e) {
      console.error('Failed to download photo', e)
      return ''
    }
  }

  const getStickerByEmoji = async (
    stickerPacks: string[],
    emoji: string
  ): Promise<Sticker | null> => {
    try {
      const stickerSet = getRandomValueArr(stickerPacks)
      const response = await bot.telegram.getStickerSet(stickerSet)
      return findByEmoji(response.stickers, emoji)
    } catch (e) {
      console.error('Failed to get sticker by emoji', e)
      return null
    }
  }

  return {
    getPhotoBase64,
    getStickerByEmoji
  }
}
