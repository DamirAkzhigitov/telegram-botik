import { getOpenAIClient } from './gpt'
import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import { delay, findByEmoji, getRandomValueArr } from './utils'
import { BotReply, Context, Sticker } from './types'
import { SessionController } from './service/SessionController'

import commands from './commands'
import OpenAI from 'openai'
import { TelegramEmoji } from 'telegraf/types'

const botName = '@nairbru007bot'

export const createBot = async (env: Context, webhookReply = false) => {
  const { openAi } = getOpenAIClient(env.API_KEY)
  const bot = new Telegraf(env.BOT_KEY, { telegram: { webhookReply } })
  const sessionController = new SessionController(env)
  // const mindController = new MindController(env)
  //
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
      const message = ('text' in ctx.message && ctx.message.text) || ''
      const isBotMentioned = !!message.match(botName)
      let isBotReplied = false

      const sessionData = await sessionController.getSession(chatId)

      const userMessage: OpenAI.Chat.ChatCompletionUserMessageParam = {
        role: 'user',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message,
              chat_id: chatId,
              message_id: ctx.message.message_id,
              timestamp: new Date(
                Number(`${ctx.message.date}000`)
              ).toISOString()
            })
          }
        ],
        name: username
      }

      const allMessages = [
        ...sessionData.userMessages.slice(0, 20),
        userMessage
      ]

      if (sessionData.firstTime) {
        await sessionController.updateSession(chatId, {
          firstTime: false
        })
        await ctx.telegram.sendMessage(
          chatId,
          `Привет, спасибо добавили меня в чат, я всегда отвечаю если вы упоминаете меня в сообщениях, а так же при любых других сообщениях с 5% шансом, для того что бы узнать команды введите /help`
        )
        return
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
      if (sessionData.promptNotSet) {
        await sessionController.updateSession(chatId, {
          prompt: message,
          promptNotSet: false
        })
        return await ctx.telegram.sendMessage(
          chatId,
          'Системный промт обновлен!'
        )
      }

      if (isBotMentioned) {
        const botReply = await openAi(
          allMessages,
          sessionData.prompt,
          sessionData.reflection
        )

        if (!botReply?.content) return

        const botMessages = JSON.parse(botReply.content)?.items as BotReply[]

        const asyncActions = botMessages.map(
          async ({ content, type, chat_id, message_id }) => {
            if (type === 'emoji') {
              const stickerSet = getRandomValueArr(sessionData.stickersPacks)
              const response = await ctx.telegram.getStickerSet(stickerSet)
              const stickerByEmoji = findByEmoji(
                response.stickers as Sticker[],
                content
              )
              return ctx.telegram.sendSticker(chat_id, stickerByEmoji.file_id)
            } else if (type === 'message') {
              isBotReplied = true

              return ctx.telegram.sendMessage(chat_id, content, {
                ...(message_id
                  ? {
                      reply_parameters: {
                        message_id
                      }
                    }
                  : {})
              })
            } else if (type === 'reaction') {
              return ctx.telegram.setMessageReaction(chat_id, message_id, [
                {
                  type: 'emoji',
                  emoji: content as TelegramEmoji
                }
              ])
            } else if (type === 'reflection') {
            }
          }
        )

        await Promise.allSettled([
          ctx.telegram.sendChatAction(chatId, 'typing'),
          delay,
          ...asyncActions
        ])

        allMessages.push(botReply)
      }

      await sessionController.updateSession(chatId, {
        userMessages: allMessages,
        lastUserMessageTime: Date.now().toString(),
        lastMessageFromBot: isBotReplied
      })

      // let image = ''
      // if ('photo' in ctx.message) {
      //   const instance = axios.create({
      //     baseURL: 'https://api.telegram.org/',
      //     timeout: 1000
      //   })
      //   const photo = ctx.message.photo
      //   // Get the highest resolution photo available
      //   const fileId = photo[photo.length - 1].file_id
      //   const file = await bot.telegram.getFile(fileId)
      //   const downloadLink = `file/bot${env.BOT_KEY}/${file.file_path}`
      //   try {
      //     const response = await instance.get(downloadLink, {
      //       responseType: 'arraybuffer'
      //     })
      //     const base64Image = Buffer.from(response.data).toString('base64')
      //     image = `data:image/jpeg;base64,${base64Image}`
      //   } catch (e) {
      //     console.error('failed download', e)
      //   }
      // }
      // const botMind = await mindController.getMind()
      //
      // const augmentedPrompt = sessionData.prompt
      //

      // const memoryItems = botMessages.filter((item) => item.type === 'memory')
      //
      // for (const memoryItem of memoryItems) {
      //   await sessionController.addMemory(chatId, memoryItem.content)
      // }
      // // Filter out selfChange items so that they don't affect reply content.
      // const nonSelfChangeMessages = botMessages.filter(
      //   (item) => item.type !== 'memory'
      // )
      // const botHistory = {
      //   text: nonSelfChangeMessages
      //     .filter(({ type }) => type === 'text')
      //     .map(({ content }) => content)
      //     .join(''),
      //   time: currentTime.toISOString(),
      //   name: 'Иван Разумов'
      // }
      // await sessionController.updateSession(chatId, {
      //   userMessages: [
      //     newMessage,
      //     ...(botHistory.text && shouldReply ? [botHistory] : []),
      //     ...sessionData.userMessages.slice(0, 20)
      //   ]
      // })
      //
      //
    } catch (error) {
      console.error('Error processing message:', error)
    }
  })
  return bot
}
