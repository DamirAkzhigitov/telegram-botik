import axios, { type AxiosInstance } from 'axios'
import OpenAI from 'openai'
import type { Context } from 'telegraf'
import { TELEGRAM_API_BASE_URL } from './constants'

const guessMimeFromPath = (filePath: string): string => {
  const extension = filePath.split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'bmp':
      return 'image/bmp'
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg'
    default:
      return 'image/jpeg'
  }
}

export const createTelegramFileClient = (): AxiosInstance =>
  axios.create({
    baseURL: TELEGRAM_API_BASE_URL,
    timeout: 1000
  })

interface MediaDependencies {
  telegram: Context['telegram']
  botToken: string
  fileClient: AxiosInstance
}

const downloadTelegramImage = async (
  deps: MediaDependencies,
  fileId: string,
  explicitMime?: string | null
): Promise<string | null> => {
  try {
    const file = await deps.telegram.getFile(fileId)
    if (!file.file_path) return null

    const downloadLink = `file/bot${deps.botToken}/${file.file_path}`
    const response = await deps.fileClient.get(downloadLink, {
      responseType: 'arraybuffer'
    })
    const arrayBuffer =
      response.data instanceof ArrayBuffer ? response.data : new ArrayBuffer(0)
    const base64Image = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = explicitMime || guessMimeFromPath(file.file_path)
    return `data:${mimeType};base64,${base64Image}`
  } catch (error) {
    console.error('Failed to download Telegram image', error)
    return null
  }
}

export const collectImageInputs = async (
  ctx: Context,
  deps: MediaDependencies
): Promise<OpenAI.Responses.ResponseInputImage[]> => {
  const imageInputs: OpenAI.Responses.ResponseInputImage[] = []
  const message = ctx.message

  if (message && 'photo' in message && message.photo) {
    const photo = message.photo
    if (Array.isArray(photo) && photo.length > 0) {
      const fileId = photo[photo.length - 1]?.file_id
      if (fileId) {
        const imageUrl = await downloadTelegramImage(deps, fileId, 'image/jpeg')
        if (imageUrl) {
          imageInputs.push({
            type: 'input_image',
            image_url: imageUrl,
            detail: 'auto'
          })
        }
      }
    }
  } else if (message && 'document' in message && message.document) {
    const document = message.document
    const mimeType = document.mime_type
    const fileId = document.file_id
    if (
      mimeType &&
      typeof mimeType === 'string' &&
      mimeType.startsWith('image/') &&
      fileId
    ) {
      const imageUrl = await downloadTelegramImage(deps, fileId, mimeType)
      if (imageUrl) {
        imageInputs.push({
          type: 'input_image',
          image_url: imageUrl,
          detail: 'auto'
        })
      }
    }
  }

  return imageInputs
}
