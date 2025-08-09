import OpenAI from 'openai'
import { MessagesArray } from '../types'
import { openAIConfig } from '../config'

export const createGptService = (apiKey: string) => {
  const openai = new OpenAI({
    apiKey: apiKey
  })

  const gptApi = async (
    userMessage: string,
    messages: string,
    customPrompt: string,
    imageUrl?: string,
    memories?: string
  ): Promise<MessagesArray> => {
    try {
      const memoryContext = memories ? `\nВажная информация: ${memories}` : ''

      const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        {
          type: 'text',
          text: userMessage
        }
      ]

      if (imageUrl) {
        content.push({
          type: 'image_url',
          image_url: {
            url: imageUrl
          }
        })
      }

      const options: OpenAI.Chat.ChatCompletionCreateParams = {
        model: openAIConfig.model,
        messages: [
          {
            role: 'user',
            content: content
          },
          {
            role: 'system',
            content: `Строго следуй следующему: ${customPrompt}, используй форматирование: ${openAIConfig.promptFormatting} история сообщений: ${messages},${memoryContext}`
          }
        ],
        max_tokens: 8000,
        temperature: 0.5,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'content_list',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  description: 'List of content items',
                  items: {
                    type: 'object',
                    properties: {
                      type: {
                        type: 'string',
                        enum: ['text', 'emoji', 'reaction', 'memory'],
                        description: 'Type of content'
                      },
                      content: {
                        type: 'string',
                        description: 'Content data'
                      }
                    },
                    required: ['type', 'content'],
                    additionalProperties: false
                  }
                }
              },
              required: ['items'],
              additionalProperties: false
            }
          }
        }
      }

      const completion = await openai.chat.completions.create(options)

      const response = JSON.parse(
        completion?.choices?.[0]?.message.content || '[]'
      )

      if (!response?.items) return []

      return response.items
    } catch (e) {
      console.error(e)
      return []
    }
  }

  return {
    generateResponse: gptApi
  }
}
