import OpenAI from 'openai'
import type { MessagesArray } from '../types'

export type NonMemoryMessage = Exclude<
  MessagesArray[number],
  { type: 'memory' }
>

interface UserMessageParams {
  username: string
  trimmedMessage: string
  imageInputs: OpenAI.Responses.ResponseInputImage[]
  /** Prepended to the first text line for history (e.g. forum thread id). */
  historyThreadPrefix?: string
}

export const composeUserContent = ({
  username,
  trimmedMessage,
  imageInputs,
  historyThreadPrefix
}: UserMessageParams): OpenAI.Responses.ResponseInputMessageContentList => {
  const content: OpenAI.Responses.ResponseInputMessageContentList = []
  const prefix = historyThreadPrefix ?? ''

  if (trimmedMessage.length > 0) {
    content.push({
      type: 'input_text',
      text: `${prefix}${username}: ${trimmedMessage}`
    })
  } else if (imageInputs.length > 0) {
    content.push({
      type: 'input_text',
      text: `${prefix}${username} отправил изображение`
    })
  }

  content.push(...imageInputs)

  if (content.length === 0) {
    content.push({
      type: 'input_text',
      text: `${prefix}${username}: ${trimmedMessage}`
    })
  }

  return content
}

export const createUserMessage = (
  content: OpenAI.Responses.ResponseInputMessageContentList
): OpenAI.Responses.ResponseInputItem.Message => ({
  role: 'user',
  content
})

export const createLoggedMessage = (
  message: OpenAI.Responses.ResponseInputItem.Message
): OpenAI.Responses.ResponseInputItem.Message => ({
  ...message,
  content: message.content.map((item) =>
    item.type === 'input_image'
      ? {
          ...item,
          image_url: '[data-url omitted]'
        }
      : item
  )
})

export const filterResponseMessages = (
  botMessages: MessagesArray
): NonMemoryMessage[] =>
  botMessages.filter((item) => item.type !== 'memory') as NonMemoryMessage[]

export const extractMemoryItems = (botMessages: MessagesArray) =>
  botMessages.filter((item) => item.type === 'memory')
