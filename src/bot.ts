import { getOpenAIClient } from './gpt'
import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import {
  delay,
  findByEmoji,
  getRandomValueArr,
  isReply
} from './utils'
import { ChatMessage, Context, Sticker } from './types'
import { SessionController } from './service/SessionController'
import { MindController } from './mind'
import axios from 'axios'
import commands from './commands'

const botName = '@nairbru007bot'

export const createBot = async (env: Context, webhookReply = false) => {
  const { openAi } = getOpenAIClient(env.API_KEY)
  const bot = new Telegraf(env.BOT_KEY, { telegram: { webhookReply } })
  const sessionController = new SessionController(env)
  const mindController = new MindController(env)

  commands.forEach((command) => {
    command(bot, sessionController)
  })

  bot.on(message(), async (ctx) => {
    try {
      if (ctx.message.from.is_bot) return

      const username =
        ctx.message.from.first_name ||
        ctx.message.from.last_name ||
        ctx.message.from.username ||
        'Anonymous'
      const chatId = ctx.chat.id
      const userMessage =
        ('text' in ctx.message && ctx.message.text) || ''
      const sessionData = await sessionController.getSession(chatId)
      const shouldReply =
        isReply(sessionData.replyChance) ||
        !!userMessage.match(botName)
      if (sessionData.firstTime) {
        await sessionController.updateSession(chatId, {
          firstTime: false
        })
        await ctx.telegram.sendMessage(
          chatId,
          `Привет, спасибо добавили меня в чат, я всегда отвечаю если вы упоминаете меня в сообщениях, а так же при любых других сообщениях с 5% шансом, для того что бы узнать команды введите /help`
        )
      }
      if (sessionData.promptNotSet) {
        await sessionController.updateSession(chatId, {
          prompt: userMessage,
          promptNotSet: false
        })
        return await ctx.telegram.sendMessage(
          chatId,
          'Системный промт обновлен!'
        )
      }
      if (sessionData.stickerNotSet) {
        if (
          'sticker' in ctx.message &&
          ctx.message.sticker?.set_name
        ) {
          const onlyDefault =
            sessionController.isOnlyDefaultStickerPack()
          let newPack = sessionData.stickersPacks
          if (onlyDefault) {
            newPack = [ctx.message.sticker.set_name]
          } else {
            newPack.push(ctx.message.sticker.set_name)
          }
          await sessionController.updateSession(chatId, {
            stickersPacks: newPack,
            stickerNotSet: false
          })
          await ctx.telegram.sendMessage(
            chatId,
            'Стикер пак был добавлен!'
          )
          return
        } else {
          await sessionController.updateSession(chatId, {
            stickersPacks: ['gufenpchela'],
            stickerNotSet: false
          })
        }
      }
      let image = ''
      if ('photo' in ctx.message) {
        const instance = axios.create({
          baseURL: 'https://api.telegram.org/',
          timeout: 1000
        })
        const photo = ctx.message.photo
        // Get the highest resolution photo available
        const fileId = photo[photo.length - 1].file_id
        const file = await bot.telegram.getFile(fileId)
        const downloadLink = `file/bot${env.BOT_KEY}/${file.file_path}`
        try {
          const response = await instance.get(downloadLink, {
            responseType: 'arraybuffer'
          })
          const base64Image = Buffer.from(response.data).toString(
            'base64'
          )
          image = `data:image/jpeg;base64,${base64Image}`
        } catch (e) {
          console.error('failed download', e)
        }
      }
      const currentTime = new Date()
      const newMessage: ChatMessage = {
        name: username,
        text: ctx.message?.caption || userMessage,
        time: currentTime.toISOString()
      }
      const formattedMemories =
        sessionData.memories?.length > 0
          ? sessionController.getFormattedMemories()
          : ''
      const recentMessages = [...sessionData.userMessages]
        .map((m) => `${m.name}[${m.time}]: ${m.text};`)
        .join(';')

      // Retrieve the current global mind and format it to be included in the prompt.
      const botMind = await mindController.getMind()
      const mindContext =
        'Bot Mind:- mood: ' +
        botMind.mood +
        '- thinking: ' +
        botMind.thinking +
        '- tasks: ' +
        botMind.tasks
      // Append mind context to the system prompt.
      const augmentedPrompt = sessionData.prompt + mindContext

      const botMessages = await openAi(
        `${newMessage.name}[${newMessage.time}] написал: ${newMessage.text}`,
        recentMessages,
        augmentedPrompt,
        image,
        formattedMemories
      )
      const memoryItems = botMessages.filter(
        (item) => item.type === 'memory'
      )
      for (const memoryItem of memoryItems) {
        await sessionController.addMemory(chatId, memoryItem.content)
      }
      // Filter out selfChange items so that they don't affect reply content.
      const nonSelfChangeMessages = botMessages.filter(
        (item) => item.type !== 'memory'
      )
      const botHistory = {
        text: nonSelfChangeMessages
          .filter(({ type }) => type === 'text')
          .map(({ content }) => content)
          .join(''),
        time: currentTime.toISOString(),
        name: 'Иван Разумов'
      }
      await sessionController.updateSession(chatId, {
        userMessages: [
          newMessage,
          ...(botHistory.text && shouldReply ? [botHistory] : []),
          ...sessionData.userMessages.slice(0, 20)
        ]
      })

      const asyncActions = nonSelfChangeMessages.map(
        async ({ content, type }) => {
          if (type === 'emoji' && shouldReply) {
            const stickerSet = getRandomValueArr(
              sessionData.stickersPacks
            )
            const response = await ctx.telegram.getStickerSet(
              stickerSet
            )
            const stickerByEmoji = findByEmoji(
              response.stickers as Sticker[],
              content
            )
            return ctx.telegram.sendSticker(
              ctx.chat.id,
              stickerByEmoji.file_id
            )
          } else if (type === 'text' && shouldReply) {
            return ctx.telegram.sendMessage(chatId, content)
          } else if (type === 'reaction') {
            return ctx.telegram.setMessageReaction(
              chatId,
              ctx.message.message_id,
              [
                {
                  type: 'emoji',
                  emoji: content
                }
              ]
            )
          } else if (type === 'selfChange') {
            // Parse the selfChange payload as JSON and update the global mind.
            try {
              const mindUpdates = JSON.parse(content)
              await mindController.updateMind(mindUpdates)
            } catch (error) {
              console.error('Error processing selfChange action:', error)
            }
          }
        }
      )

      await Promise.all([
        ...(shouldReply
          ? [ctx.telegram.sendChatAction(chatId, 'typing')]
          : []),
        delay,
        ...asyncActions
      ])
    } catch (error) {
      console.error('Error processing message:', error)
    }
  })
  return bot
}
