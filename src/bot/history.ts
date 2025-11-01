import OpenAI from 'openai'
import type { MessagesArray, SessionData } from '../types'
import { IMAGE_PLACEHOLDER_TEXT } from './constants'

export const sanitizeHistoryMessages = (
  messages: SessionData['userMessages']
): SessionData['userMessages'] =>
  messages.map((message) => {
    if (message.role !== 'user') return message

    const userMessage = message as OpenAI.Responses.ResponseInputItem.Message
    const sanitizedContent = userMessage.content.map((item) => {
      if (item.type === 'input_image') {
        return {
          type: 'input_text',
          text: IMAGE_PLACEHOLDER_TEXT
        } as OpenAI.Responses.ResponseInputText
      }
      return item
    })

    return {
      ...userMessage,
      content: sanitizedContent
    }
  })

export const buildAssistantHistoryMessages = (
  botMessages: MessagesArray
): OpenAI.Responses.ResponseOutputMessage[] =>
  botMessages.map(
    (message) =>
      ({
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: message.type === 'image' ? 'image' : message.content
          }
        ]
      }) as OpenAI.Responses.ResponseOutputMessage
  )
