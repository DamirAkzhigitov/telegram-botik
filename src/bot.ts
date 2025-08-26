import { getOpenAIClient } from './gpt'
import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import { delay, findByEmoji, getRandomValueArr, isReply } from './utils'
import { Sticker } from './types'
import { SessionController } from './service/SessionController'
import { UserService } from './service/UserService'
import OpenAI from 'openai'

import axios from 'axios'
import commands from './commands'
import { EmbeddingService } from './service/EmbeddingService'

const botName = '@nairbru007bot'
const THREAD = 15117

export async function createBot(env: Env, webhookReply = false) {
  const { responseApi, openai } = getOpenAIClient(env.API_KEY)

  const embeddingService = new EmbeddingService(env)
  const bot = new Telegraf(env.BOT_TOKEN, { telegram: { webhookReply } })
  const sessionController = new SessionController(env)
  const userService = new UserService(env.DB)

  commands.forEach((command) => {
    command(bot, sessionController, userService, env)
  })

  bot.on(message(), async (ctx) => {
    try {
      // ctx.message.message_thread_id !== THREAD
      if (ctx.message.from.is_bot) return

      try {
        await userService.registerOrGetUser({
          id: ctx.message.from.id,
          username: ctx.message.from.username,
          first_name: ctx.message.from.first_name,
          last_name: ctx.message.from.last_name
        })
      } catch (error) {
        console.error('Error registering user:', error)
      }

      const username =
        ctx.message.from.first_name ||
        ctx.message.from.last_name ||
        ctx.message.from.username ||
        'Anonymous'
      const chatId = ctx.chat.id
      const userMessage = (
        ('text' in ctx.message && ctx.message.text) ||
        ''
      ).replace('@nairbru007bot', '')
      const sessionData = await sessionController.getSession(chatId)

      if (sessionData.firstTime) {
        await sessionController.updateSession(chatId, {
          firstTime: false
        })
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
        if ('sticker' in ctx.message && ctx.message.sticker?.set_name) {
          const onlyDefault = sessionController.isOnlyDefaultStickerPack()
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
          await ctx.telegram.sendMessage(chatId, 'Стикер пак был добавлен!')
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
        const downloadLink = `file/bot${env.BOT_TOKEN}/${file.file_path}`
        try {
          const response = await instance.get(downloadLink, {
            responseType: 'arraybuffer'
          })
          const base64Image = Buffer.from(response.data).toString('base64')
          image = `data:image/jpeg;base64,${base64Image}`
        } catch (e) {
          console.error('failed download', e)
        }
      }

      const message = `${('caption' in ctx.message && ctx.message.caption) || userMessage}`

      const newMessage: OpenAI.Responses.ResponseInputItem.Message = {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `${username}: ${message}`
          }
        ]
      }

      if (message.length > 10) {
        await embeddingService.saveMessage(
          chatId,
          'user',
          `${username}: ${message}`
        )
      }

      const relativeMessage = await embeddingService.fetchRelevantMessages(
        chatId,
        message
      )

      const formattedMemories = sessionController.getFormattedMemories()

      const botMessages = await responseApi([
        ...formattedMemories,
        ...relativeMessage.map(
          (message) =>
            ({
              role: 'system',
              content: [
                {
                  type: 'input_text',
                  text: message?.content
                }
              ]
            }) as unknown as OpenAI.Responses.ResponseOutputMessage
        ),
        ...sessionData.userMessages,
        newMessage
      ])

      if (!botMessages) return

      const memoryItems = botMessages.filter((item) => item.type === 'memory')

      for (const memoryItem of memoryItems) {
        await sessionController.addMemory(chatId, memoryItem.content)
      }

      const responseMessages = botMessages.filter(
        (item) => item.type !== 'memory'
      )

      await sessionController.updateSession(chatId, {
        userMessages: [
          ...sessionData.userMessages,
          newMessage,
          ...botMessages.map(
            (message) =>
              ({
                role: 'assistant',
                content: [{ type: 'output_text', text: message.content }]
              }) as OpenAI.Responses.ResponseOutputMessage
          )
        ]
      })

      const asyncActions = responseMessages.map(async ({ content, type }) => {
        if (type === 'emoji') {
          const stickerSet = getRandomValueArr(sessionData.stickersPacks)
          const response = await ctx.telegram.getStickerSet(stickerSet)
          const stickerByEmoji = findByEmoji(
            response.stickers as Sticker[],
            content
          )
          return ctx.telegram.sendSticker(ctx.chat.id, stickerByEmoji.file_id)
        } else if (type === 'text') {
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
        }
      })

      await Promise.all([
        ctx.telegram.sendChatAction(chatId, 'typing'),
        delay,
        ...asyncActions
      ])
    } catch (error) {
      console.error('Error processing message:', error)
    }
  })

  return bot
}
