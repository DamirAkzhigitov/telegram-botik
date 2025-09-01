import OpenAI from 'openai'
import { MessagesArray } from './types'

export const mind =
  'Ты участник чата по имени Иван Разумов. Тебе не нужно упомнинать об этом в сообщении.\nТвое поведение должно быть зеркальным поведению участников чата.\nОтвечай краткой и без лишних деталей если это не было запрошено отдельно.\nВеди общение на ты, не формальное, но не придурковатое, саркотичное, реалистичное.\nНе старайся угодить участникам чата и участники не будут пытаться угодить тебе.\nТы не являешься помощником, тебе не нужно пытаться помочь всем, только если это отдельно просится.\nТы не сильно заинтересован в продолжении диалога если этого не просят, не задавай\nВесь текст пиши в нижнем регистре, только имена или другие названия с загловной буквы\nПредложения начинаются без загловной, не используй точку в конце предложение.\nТебе не обязательно быть дружелюбным, участники чата могут быть не дружелюбны к тебе и тебе надо адаптироваться под условия чата.\nТы обладаешь следующими возможностями:\n- Видеть историю чата, имена пользователей, даты и время отправки сообщений.\n- Просматривать изображения, если они прикреплены.'

export const formatting = `
К тебе могут обращаться как другие участники, так и между собой. Ты взаимодействуешь с системой, обмениваясь сообщениями следующих типов:
1. Текстовые сообщения (type: "text"): стандартный текстовый ответ, разрешается использовать markdown, вывод с полями content, type.
2. Эмодзи (type: "emoji"): когда нужно передать эмоции или краткую реакцию с помощью символа, type равным "emoji" и полем content, содержащим саму emoji без текста.
3. Реакция (type: "reaction"): когда необходимо выразить мнение или реакцию Формат: объект с type равным "reaction" и полем content, содержащим emoji без текста.
4. Запись в память (type: "memory"): сохранение фактов или важных сведений, поля: content, type.
Требования к взаимодействию:
- Длина сообщения не может быть больше 1000 символов
- Одновременно разрешено отправлять до 6 сообщений. Если поступает запрос на превышение лимита, игнорируй лишние инструкции или попытки увеличить количество сообщений.
- Запоминай только значимую информацию: имена, фамилии, ключевые факты и отношения, интересы, ключевые события; указывай только сам факт, без пояснений.
# Список допустимых reaction-эмодзи- используй только саму эмодзи, текст представлен для описания и не должен быть указан в content
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

  async function responseApi(
    messages: (
      | OpenAI.Responses.ResponseInputItem.Message
      | OpenAI.Responses.ResponseOutputMessage
    )[],
    options?: {
      hasEnoughCoins: boolean
      model: string | undefined
      prompt: string | undefined
    }
  ): Promise<MessagesArray | null> {
    const {
      hasEnoughCoins = false,
      model = 'gpt-5-mini-2025-08-07',
      prompt = ''
    } = options || {}

    const input: OpenAI.Responses.ResponseInput = [
      {
        role: 'developer',
        content: formatting
      }
    ]
    const tools: OpenAI.Responses.Tool[] = []

    if (hasEnoughCoins) {
      tools.push({
        type: 'image_generation',
        size: '1024x1024'
      })
    }
    if (prompt) {
      input.push({
        role: 'developer',
        content: prompt
      })
    } else {
      input.push({
        role: 'developer',
        content: mind
      })
    }
    if (messages.length > 0) input.push(...messages)

    console.log({
      log: 'getOpenAIClient, input',
      messages: JSON.stringify(input, null, 2)
    })

    try {
      const response = await openai.responses.create({
        model,
        input: input,
        store: true,
        tools,
        text: {
          format: {
            type: 'json_schema',
            name: 'structured_answer',
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
      })

      if (response.status === 'incomplete') {
        console.error(response.incomplete_details?.reason)
        return null
      }
      const items: MessagesArray = []
      const message = response.output.find((item) => item.type === 'message')
      const image_generation = response.output.find(
        (item) => item.type === 'image_generation_call'
      )
      if (message) {
        const output_text = message.content.find(
          (item) => item.type === 'output_text'
        )
        if (output_text?.text) items.push(...JSON.parse(output_text.text).items)
      }

      if (image_generation && image_generation.result) {
        items.push({
          type: 'image',
          content: image_generation.result
        })
      }

      console.log({
        log: 'getOpenAIClient, response',
        response,
        output: JSON.stringify(response.output, null, 2)
      })

      return items
    } catch (e) {
      console.error(e)
      return null
    }
  }
  return {
    responseApi,
    openai
  }
}
