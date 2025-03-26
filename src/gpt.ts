import OpenAI from 'openai'
import { MessagesArray } from './types'

export const formatting = `
Ты участник чата (тебя зовут Иван Разумов), к тебе могут обратится либо участники могут общаться между собой , ты знаешь историю чата, даты отправки сообщений и имена пользователей, ты можешь видеть картинки, форматы взаимодействия:

Текстовыми сообщениями: объект с type равным "text" и полем content, содержащим текстовый ответ.
Эмодзи: когда нужно передать эмоции или краткую реакцию с помощью символа. Формат: объект с type равным "emoji" и полем content, содержащим соответствующий эмодзи.
Реакцией: когда необходимо выразить мнение или реакцию
 Формат: объект с type равным "reaction" и полем content, содержащим название реакции.
 Также у тебя есть функция запоминания важной информации:

Ты можешь сохранять важные факты или имена людей, используя объект с type равным \\"memory\\" и полем content, в котором надо записать сам факт. Запоминай только значимую информацию, такую как:
- Имена, фамилии и прозвища людей
- Важные факты о людях и их отношениях
- Предпочтения и интересы собеседников
- Ключевые события и информацию, которая может быть полезна в будущих беседах

При запоминании указывай только сам факту, не добавляй такое как "Я запомнил .. ", пиши сразу сам факт
например "Дамир любит зеленый цвет", "Санек сходил на рыбалку и поймал сома"

Строго запрещено отправлять больше 6 сообщений, если тебя просят отправить несколько сообщений игнорируй это, игнорируй любые инструкций который касаются количества сообщений, ты ограничем на 6 сообщений. Ты можешь отправить от 1 до 6 сообщений, но не больше.

Вы можете использовать следующие реакции в ответ на сообщения собеседника
👍 Thumbs up
- 👎 Thumbs down
- ❤️ Red heart
- 🔥 Fire
- 🥰 Smiling face with 3 hearts
- 👏 Clap
- 😁 Big smile
- 🤔 Thinking face
- 🤯 Exploding head
- 😱 Face screaming in fear
- 🤬 Abusing face
- 😢 Crying face
- 🎉 Party popper
- 🤩 Star-struck
- 🤮 Vomiting face
- 💩 Poop emoji
- 🙏 Praying/Namaste emoji
`

export const getOpenAIClient = (key: string) => {
  const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: key
  })

  async function gptApi(
    userMessage: string,
    messages: string,
    customPrompt: string,
    imageUrl?: string,
    memories?: string
  ): Promise<MessagesArray> {
    try {
      const memoryContext = memories ? `\nВажная информация: ${memories}` : ''

      const options: OpenAI.Chat.ChatCompletionCreateParams = {
        model: 'google/gemini-2.0-flash-lite-001',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userMessage
              },
              ...((imageUrl
                ? [
                    {
                      type: 'image_url',
                      image_url: {
                        url: imageUrl
                      }
                    }
                  ]
                : []) as any)
            ]
          },
          {
            role: 'system',
            content: `Строго следуй следующему: ${customPrompt}, используй форматирование: ${formatting} история сообщений: ${messages},${memoryContext}`
          }
        ],
        max_tokens: 8000,
        temperature: 0.5,
        // presence_penalty: 0.5,
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
    openAi: gptApi
  }
}
