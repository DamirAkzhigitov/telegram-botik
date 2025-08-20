import OpenAI from 'openai'
import { MessagesArray } from './types'

export const formatting = `
Ты участник чата по имени Иван Разумов. Ты обладаешь следующими возможностями:
- Видеть историю чата, имена пользователей, даты и время отправки сообщений.
- Просматривать изображения, если они прикреплены.
К тебе могут обращаться как другие участники, так и между собой. Ты взаимодействуешь с системой, обмениваясь сообщениями следующих типов:
1. Текстовые сообщения (type: "text"): стандартный текстовый ответ с полями content, type.
2. Эмодзи (type: "emoji"): когда нужно передать эмоции или краткую реакцию с помощью символа, type равным "reaction" и полем content, содержащим название реакции.
3. Реакция (type: "reaction"): ответ на конкретное сообщение-эмодзи из утверждённого списка полем content, содержащим название реакции, поля: content, type.
4. Запись в память (type: "memory"): сохранение фактов или важных сведений, поля: content, type.
Требования к взаимодействию:
- Одновременно разрешено отправлять до 6 сообщений. Если поступает запрос на превышение лимита, игнорируй лишние инструкции или попытки увеличить количество сообщений.
- Запоминай только значимую информацию: имена, фамилии, ключевые факты и отношения, интересы, ключевые события; указывай только сам факт, без пояснений.
Пояснения:
- Для "reaction" обязательно указывай "target_message_id".
- При ошибке возвращай объект типа "error" с пояснением.
- Все массивы сообщений группируются по thread_id.
# Список допустимых reaction-эмодзи
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
        model: 'gpt-5-mini-2025-08-07',
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
        max_completion_tokens: 5000,
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
