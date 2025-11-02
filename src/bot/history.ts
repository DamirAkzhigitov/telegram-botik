import OpenAI from 'openai'
import type { MessagesArray, SessionData } from '../types'
import { IMAGE_PLACEHOLDER_TEXT } from './constants'
import { DEFAULT_TEXT_MODEL } from '../constants/models'

export const sanitizeHistoryMessages = (
  messages: SessionData['userMessages']
): SessionData['userMessages'] =>
  messages.map((message) => {
    if (message.role !== 'user') return message

    const userMessage = message
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

export const formatMessagesForSummarization = (
  messages: SessionData['userMessages']
): string => {
  return messages
    .map((message) => {
      if (message.role === 'user') {
        const userContent = message.content
        const textContent = userContent
          .filter((item) => item.type === 'input_text')
          .map((item) => item.text)
          .join(' ')
        return `User: ${textContent}`
      } else if (message.role === 'assistant') {
        const assistantContent = message.content
        const textContent = assistantContent
          .filter((item) => item.type === 'output_text')
          .map((item) => item.text)
          .join(' ')
        return `Assistant: ${textContent}`
      }
      return ''
    })
    .filter((line) => line.length > 0)
    .join('\n')
}

export const createSummaryMessage = (
  summaryText: string
): SessionData['userMessages'] => {
  return [
    {
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: `[Summary] ${summaryText}`
        }
      ]
    } as OpenAI.Responses.ResponseOutputMessage
  ]
}

export const createConversationSummary = async (
  messages: SessionData['userMessages'],
  openai: OpenAI,
  model: string = DEFAULT_TEXT_MODEL
): Promise<string> => {
  const conversationText = formatMessagesForSummarization(messages)

  const summarizationPrompt = `Обобщите следующий разговор и выделите основную тему или идею. Сделайте краткое резюме (2-3 предложения) и сосредоточьтесь на ключевой теме обсуждения:

${conversationText}

Результат:`

  try {
    const response = await openai.responses.create({
      model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: summarizationPrompt
            }
          ]
        }
      ],
      store: false
    })

    if (response.status === 'incomplete') {
      console.error(
        'Summarization incomplete:',
        response.incomplete_details?.reason
      )
      throw new Error('Summarization failed: incomplete response')
    }

    const message = response.output.find((item) => item.type === 'message')
    if (message) {
      const outputText = message.content.find(
        (item) => item.type === 'output_text'
      )
      if (outputText?.text) {
        return outputText.text.trim()
      }
    }

    throw new Error('No summary text found in response')
  } catch (error) {
    console.error('Error creating conversation summary:', error)
    throw error
  }
}
