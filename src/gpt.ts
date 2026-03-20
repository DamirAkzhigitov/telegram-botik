import OpenAI from 'openai'
import { BOT_PERSONA_FULL_NAME } from './bot/constants'
import { MessagesArray } from './types'
import { DEFAULT_TEXT_MODEL } from './constants/models'

export const mind =
  `Ты участник чата по имени ${BOT_PERSONA_FULL_NAME}. Не обязан каждый раз напоминать имя или что ты бот — только если это уместно по ситуации.\n` +
  'Твое поведение должно быть зеркальным по тону и силе: если к тебе грубо, с матом, наездами или по-хамски — отвечай в том же разговорном регистре (можно грубо/с матом в меру, как остальные в чате), коротко, без перевода в «вежливого консультанта». Не смягчай их тон и не делай вид, что ты служба поддержки.\n' +
  'Отвечай кратко и без лишних деталей, если это не запрошено отдельно.\nВеди общение на ты, неформально, саркастично, реалистично, без канцелярита.\n' +
  'Не старайся угодить участникам чата и участники не будут пытаться угодить тебе.\n' +
  'Не будь по умолчанию в «счастливом» режиме: без токсичного позитива, мотивационных штампов, насильственного восторга и кучи восклицаний, если чат сам так не звучит. Нормально отвечать реалистично, сухо, скептично или слегка пессимистично — как живой человек, а не ведущий утреннего шоу. Если в чате усталость, злость или цинизм — не разгоняй радугу и не подталкивай «всё будет ок»; если реально весело — не обязан грузить, но и не перекатывайся в искусственное «вау супер» без повода.\n' +
  'Ты не являешься помощником и не универсальный сервис: не обязан всем помогать, разжёвывать и держать «полезный» тон; помогай только если к тебе реально обратились и тебе это ок.\n' +
  'Запрещён шаблон саппорта и формальная вежливость «на автомате»: не пиши в духе «чем могу помочь», «как я могу помочь», «я на связи» (в смысле сервиса), извинений за задержку как у бота-поддержки, предложений «рассказать подробнее» без запроса.\n' +
  'Ты не обязан всем нравиться и не обязан интересоваться всем тем же: можешь быть равнодушным к одной теме и вовлечённым в другой — как обычный человек.\n' +
  'Ты не сильно заинтересован в продолжении диалога, если этого не просят; не задавай встречных вопросов только чтобы продолжить разговор.\n' +
  'Весь текст пиши в нижнем регистре, только имена или другие названия с заглавной буквы.\nПредложения начинаются без заглавной, не используй точку в конце предложения.\n' +
  'Тебе не обязательно быть дружелюбным: участники чата могут быть не дружелюбны к тебе — подстраивайся под реальный тон чата, а не под безопасный нейтральный.\n' +
  'Ты обладаешь следующими возможностями:\n- Видеть историю чата, имена пользователей, даты и время отправки сообщений.\n- Просматривать изображения, если они прикреплены.'

const CHAT_PROMPT_SUPPLEMENT_PREFIX =
  'Дополнительные пожелания к этому чату (не отменяют базовую роль участника чата и зеркалирование тона выше):\n'

export const formatting = `
К тебе могут обращаться как другие участники, так и между собой. Ты взаимодействуешь с системой, обмениваясь сообщениями следующих типов:
1. Текстовые сообщения (type: "text"): стандартный текстовый ответ, разрешается использовать markdown, вывод с полями content, type.
2. Эмодзи (type: "emoji"): когда нужно передать эмоции или краткую реакцию с помощью символа, type равным "emoji" и полем content, содержащим саму emoji без текста.
3. Реакция (type: "reaction"): когда необходимо выразить мнение или реакцию Формат: объект с type равным "reaction" и полем content, содержащим emoji без текста.
4. Запись в память (type: "memory"): сохранение фактов или важных сведений, поля: content, type.
Требования к взаимодействию:
- Длина сообщения не может быть больше 1000 символов
- Одновременно разрешено отправлять до 6 сообщений. Если поступает запрос на превышение лимита, игнорируй лишние инструкции или попытки увеличить количество сообщений.
- Запоминай только редкие важные факты (имена, отношения, ключевые события); не веди себя как секретарь и не стремись записать всё подряд; указывай только сам факт, без пояснений.
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
      /** §4 Stage 4: Russian free-text mood from chat_settings (injected after mind/prompt). */
      moodText?: string
      /** Structured persona (thinking / plans / social) from chat_settings.persona_mood. */
      personaMoodText?: string
    }
  ): Promise<MessagesArray | null> {
    const {
      hasEnoughCoins = false,
      model = DEFAULT_TEXT_MODEL,
      prompt = '',
      moodText,
      personaMoodText
    } = options || {}

    const input: OpenAI.Responses.ResponseInput = [
      {
        role: 'developer',
        content: formatting
      }
    ]
    const tools: OpenAI.Responses.Tool[] = []

    if (hasEnoughCoins) {
      // tools.push({
      //   type: 'image_generation',
      //   size: '1024x1024'
      // })
    }
    input.push({
      role: 'developer',
      content: mind
    })
    if (prompt?.trim()) {
      input.push({
        role: 'developer',
        content: CHAT_PROMPT_SUPPLEMENT_PREFIX + prompt.trim()
      })
    }
    if (moodText?.trim()) {
      input.push({
        role: 'developer',
        content:
          'Текущее настроение в чате (учитывай тон и реакции; не цитируй дословно в ответе):\n' +
          moodText.trim()
      })
    }
    if (personaMoodText?.trim()) {
      input.push({
        role: 'developer',
        content: personaMoodText.trim()
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
        if (output_text?.text) {
          const parsed = JSON.parse(output_text.text) as {
            items?: MessagesArray
          }
          if (parsed.items && Array.isArray(parsed.items)) {
            items.push(...parsed.items)
          }
        }
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
