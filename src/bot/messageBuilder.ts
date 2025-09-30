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
}

export const composeUserContent = ({
  username,
  trimmedMessage,
  imageInputs
}: UserMessageParams): OpenAI.Responses.ResponseInputMessageContentList => {
  const content: OpenAI.Responses.ResponseInputMessageContentList = []

  if (trimmedMessage.length > 0) {
    content.push({
      type: 'input_text',
      text: `${username}: ${trimmedMessage}`
    })
  } else if (imageInputs.length > 0) {
    content.push({
      type: 'input_text',
      text: `${username} отправил изображение`
    })
  }

  content.push(...imageInputs)

  if (content.length === 0) {
    content.push({
      type: 'input_text',
      text: `${username}: ${trimmedMessage || 'отправил сообщение без текста'}`
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
