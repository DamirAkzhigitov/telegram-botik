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

export async function createBot(env: Env, webhookReply = false) {
  const { responseApi } = getOpenAIClient(env.API_KEY)

  const embeddingService = new EmbeddingService(env)
  const bot = new Telegraf(env.BOT_TOKEN, { telegram: { webhookReply } })
  const sessionController = new SessionController(env)
  const userService = new UserService(env.DB)

  commands.forEach((command) => {
    command(bot, sessionController, userService, env)
  })

  bot.on(message(), async (ctx) => {
    try {
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
      const chatId = ctx.chat.id

      const sessionData = await sessionController.getSession(chatId)

      const shouldReply = sessionData.chat_settings.reply_only_in_thread
        ? ctx.message.message_thread_id === sessionData.chat_settings.thread_id
        : true

      const username =
        ctx.message.from.first_name ||
        ctx.message.from.last_name ||
        ctx.message.from.username ||
        'Anonymous'
      const userMessage = (
        ('text' in ctx.message && ctx.message.text) ||
        ''
      ).replace(botName, '')

      console.log({
        log: 'bot.on(message())',
        sessionData,
        chatId,
        shouldReply,
        username,
        userMessage
      })

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
          'Системный промт обновлен!',
          sessionData.chat_settings.send_message_option
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
          await ctx.telegram.sendMessage(
            chatId,
            'Стикер пак был добавлен!',
            sessionData.chat_settings.send_message_option
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
      const content: OpenAI.Responses.ResponseInputMessageContentList = [
        {
          type: 'input_text',
          text: `${username}: ${message}`
        }
      ]

      // if (image) content.push({
      //   type: 'input_image',
      //   file_data: image
      // })

      const newMessage: OpenAI.Responses.ResponseInputItem.Message = {
        role: 'user',
        content: content
      }

      console.log({
        log: 'newMessage',
        newMessage
      })

      if (message.length > 10) {
        await embeddingService.saveMessage(
          chatId,
          'user',
          `${username}: ${message}`
        )
      }

      if (!shouldReply) return

      const relativeMessage = await embeddingService.fetchRelevantMessages(
        chatId,
        message
      )

      console.log({
        log: 'relativeMessage',
        relativeMessage
      })

      const formattedMemories = sessionController.getFormattedMemories()

      console.log({
        log: 'formattedMemories',
        formattedMemories
      })

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

      console.log({
        log: 'botMessages',
        botMessages
      })

      if (!botMessages) return

      const memoryItems = botMessages.filter((item) => item.type === 'memory')

      console.log({
        log: 'memoryItems',
        memoryItems
      })

      for (const memoryItem of memoryItems) {
        await sessionController.addMemory(chatId, memoryItem.content)
      }

      const responseMessages = botMessages.filter(
        (item) => item.type !== 'memory'
      )

      const messages = [
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

      await sessionController.updateSession(chatId, {
        userMessages: messages.splice(-20)
      })

      const asyncActions = responseMessages.map(async ({ content, type }) => {
        if (type === 'emoji') {
          const stickerSet = getRandomValueArr(sessionData.stickersPacks)
          const response = await ctx.telegram.getStickerSet(stickerSet)
          const stickerByEmoji = findByEmoji(
            response.stickers as Sticker[],
            content
          )
          console.log({
            log: 'sendSticker',
            chatId,
            content: stickerByEmoji.file_id,
            send_message_option: sessionData.chat_settings.send_message_option
          })

          return ctx.telegram.sendSticker(
            chatId,
            stickerByEmoji.file_id,
            sessionData.chat_settings.send_message_option
          )
        } else if (type === 'text') {
          console.log({
            log: 'sendMessage',
            chatId,
            content: content,
            send_message_option: sessionData.chat_settings.send_message_option
          })

          return ctx.telegram.sendMessage(
            chatId,
            content,
            sessionData.chat_settings.send_message_option
          )
        } else if (type === 'reaction') {
          console.log({
            log: 'setMessageReaction',
            chatId,
            content: content,
            message_id: ctx.message.message_id
          })

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
        ctx.telegram.sendChatAction(
          chatId,
          'typing',
          sessionData.chat_settings.send_message_option
        ),
        delay,
        ...asyncActions
      ])
    } catch (error) {
      console.error('Error processing message:', error)
    }
  })

  return bot
}
