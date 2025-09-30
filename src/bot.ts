import { getOpenAIClient } from './gpt'
import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import { base64ToBlob, delay, findByEmoji, getRandomValueArr } from './utils'
import { Sticker, Message } from './types'
import { SessionController } from './service/SessionController'
import { UserService } from './service/UserService'
import OpenAI from 'openai'

import axios from 'axios'
import commands from './commands'
import { EmbeddingService } from './service/EmbeddingService'
import { RecordMetadata } from '@pinecone-database/pinecone'
import { findAllowedModel, resolveModelChoice } from './constants/models'

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

      if (sessionData?.model === 'not_set') {
        const requestedModel = userMessage.trim().split(/\s+/)[0]
        const matchedModel = findAllowedModel(requestedModel)
        const modelToUse = resolveModelChoice(requestedModel)

        await sessionController.updateSession(chatId, {
          model: modelToUse
        })

        const reply = matchedModel
          ? `Модель обновлена на ${modelToUse}`
          : `Модель не распознана. Используем ${modelToUse}.`

        return await ctx.telegram.sendMessage(
          chatId,
          reply,
          sessionData.chat_settings.send_message_option
        )
      }

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

      const telegramFileClient = axios.create({
        baseURL: 'https://api.telegram.org/',
        timeout: 1000
      })

      const imageInputs: OpenAI.Responses.ResponseInputImage[] = []

      const guessMimeFromPath = (filePath: string): string => {
        const extension = filePath.split('.').pop()?.toLowerCase()
        switch (extension) {
          case 'png':
            return 'image/png'
          case 'webp':
            return 'image/webp'
          case 'gif':
            return 'image/gif'
          case 'bmp':
            return 'image/bmp'
          case 'jpeg':
          case 'jpg':
            return 'image/jpeg'
          default:
            return 'image/jpeg'
        }
      }

      const downloadTelegramImage = async (
        fileId: string,
        explicitMime?: string | null
      ) => {
        try {
          const file = await bot.telegram.getFile(fileId)
          if (!file.file_path) return null

          const downloadLink = `file/bot${env.BOT_TOKEN}/${file.file_path}`
          const response = await telegramFileClient.get(downloadLink, {
            responseType: 'arraybuffer'
          })
          const base64Image = Buffer.from(response.data).toString('base64')
          const mimeType = explicitMime || guessMimeFromPath(file.file_path)
          return `data:${mimeType};base64,${base64Image}`
        } catch (error) {
          console.error('Failed to download Telegram image', error)
          return null
        }
      }

      if ('photo' in ctx.message) {
        const photo = ctx.message.photo
        const fileId = photo[photo.length - 1].file_id
        const imageUrl = await downloadTelegramImage(fileId, 'image/jpeg')
        if (imageUrl) {
          imageInputs.push({
            type: 'input_image',
            image_url: imageUrl,
            detail: 'auto'
          })
        }
      } else if ('document' in ctx.message && ctx.message.document) {
        const { mime_type, file_id } = ctx.message.document
        if (mime_type && mime_type.startsWith('image/')) {
          const imageUrl = await downloadTelegramImage(file_id, mime_type)
          if (imageUrl) {
            imageInputs.push({
              type: 'input_image',
              image_url: imageUrl,
              detail: 'auto'
            })
          }
        }
      }

      const message = `${('caption' in ctx.message && ctx.message.caption) || userMessage}`
      const trimmedMessage = message.trim()
      const content: OpenAI.Responses.ResponseInputMessageContentList = []

      if (trimmedMessage.length > 0) {
        content.push({
          type: 'input_text',
          text: `${username}: ${trimmedMessage}`
        })
      } else if (imageInputs.length > 0) {
        content.push({
          type: 'input_text',
          text: `${username} отправил изображение`
        })
      }

      content.push(...imageInputs)

      if (content.length === 0) {
        content.push({
          type: 'input_text',
          text: `${username}: ${trimmedMessage || 'отправил сообщение без текста'}`
        })
      }

      const newMessage: OpenAI.Responses.ResponseInputItem.Message = {
        role: 'user',
        content: content
      }

      const loggedMessage = {
        ...newMessage,
        content: newMessage.content.map((item) =>
          item.type === 'input_image'
            ? {
                ...item,
                image_url: '[data-url omitted]'
              }
            : item
        )
      }

      console.log({
        log: 'newMessage',
        newMessage: loggedMessage
      })

      if (message.length > 10 && sessionData.toggle_history) {
        await embeddingService.saveMessage(
          chatId,
          'user',
          `${username}: ${message}`
        )
      }

      if (!shouldReply) return

      let relativeMessage: (RecordMetadata | undefined)[] = []

      if (sessionData.toggle_history) {
        relativeMessage = await embeddingService.fetchRelevantMessages(
          chatId,
          message
        )
      }

      console.log({
        log: 'relativeMessage',
        relativeMessage
      })

      let formattedMemories: OpenAI.Responses.ResponseInputItem.Message[] = []

      if (sessionData.toggle_history) {
        formattedMemories = sessionController.getFormattedMemories()
      }

      console.log({
        log: 'formattedMemories',
        formattedMemories
      })

      const hasEnoughCoins = await userService.hasEnoughCoins(ctx.from.id, 1)

      const botMessages = await responseApi(
        [
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
        ],
        {
          hasEnoughCoins,
          model: sessionData.model,
          prompt: sessionData.prompt
        }
      )

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

      if (sessionData.toggle_history) {
        for (const memoryItem of memoryItems) {
          await sessionController.addMemory(chatId, memoryItem.content)
        }
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
              content: [
                {
                  type: 'output_text',
                  text: message.type === 'image' ? 'image' : message.content
                }
              ]
            }) as OpenAI.Responses.ResponseOutputMessage
        )
      ]

      if (sessionData.toggle_history) {
        await sessionController.updateSession(chatId, {
          userMessages: messages.splice(-20)
        })
      }

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

          return ctx.telegram.sendMessage(chatId, content, {
            ...sessionData.chat_settings.send_message_option,
            parse_mode: 'Markdown'
          })
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
        } else if (type === 'image') {
          await userService.deductCoins(ctx.from.id, 1, 'image_generation')
          const form = new FormData()

          const blob = base64ToBlob(content, 'image/jpeg')
          const file = new File([blob], 'image.jpg', { type: 'image/jpeg' })

          form.append('chat_id', String(chatId))
          form.append('photo', file)

          if (sessionData.chat_settings.thread_id) {
            form.append(
              'message_thread_id',
              String(sessionData.chat_settings.thread_id)
            )
          }

          await fetch(
            `https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`,
            {
              method: 'POST',
              body: form
            }
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
