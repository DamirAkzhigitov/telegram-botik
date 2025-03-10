import { getOpenAIClient } from './gpt'
import { Telegraf, Markup } from 'telegraf'
import { message } from 'telegraf/filters'
import { delay, findByEmoji, getRandomValueArr, isReply } from './utils'
import { ChatMessage, Context, Sticker } from './types'
import { SessionController } from './service/SessionController'
import { toBase64 } from 'openai/core'
import axios from 'axios'

const botName = '@nairbru007bot'

export const createBot = async (env: Context, webhookReply = false) => {
  const { openAi } = getOpenAIClient(env.API_KEY)
  const bot = new Telegraf(env.BOT_KEY, {
    telegram: { webhookReply }
  })
  const sessionController = new SessionController(env)

  bot.command('set_reply_chance', async (ctx) => {
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('5%', '0.05'),
        Markup.button.callback('25%', '0.25'),
        Markup.button.callback('50%', '0.50'),
        Markup.button.callback('75%', '0.75'),
        Markup.button.callback('100%', '1')
      ]
    ])
    await ctx.reply('Вероятность ответа:', keyboard)
  })

  bot.action(['0.05', '0.25', '0.50', '0.75', '1'], async (ctx) => {
    await ctx.answerCbQuery()
    const percentage = ctx.match[0]
    if (ctx.chat?.id) {
      await sessionController.getSession(ctx.chat.id)
      await sessionController.updateSession(ctx.chat.id, {
        replyChance: percentage
      })
    }
    await ctx.editMessageText(`Вы выбрали ${Number(percentage) * 100}%`)
  })

  bot.command('help', async (ctx) => {
    try {
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        `/set_reply_chance - выберите с каким шансом бот будет отвечать
/reset_sticker_pack - сбросить выбор стикер паков
/add_sticker_pack - добавить боту новый стикер пак
/set_new_prompt - установить системный промпт
/show_memories - показать запомненную информацию о чате
/clear_memories - очистить все запомненные данные`
      )
    } catch (error) {
      console.error('Error help:', error)
    }
  })

  bot.command('reset_sticker_pack', async (ctx) => {
    try {
      await sessionController.getSession(ctx.chat.id)
      await sessionController.resetStickers(ctx.chat.id)
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        'Стикер пак обновлен до стандартного'
      )
    } catch (error) {
      console.error('Error reset_sticker_pack:', error)
    }
  })

  bot.command('add_sticker_pack', async (ctx) => {
    try {
      await sessionController.getSession(ctx.chat.id)
      await sessionController.updateSession(ctx.chat.id, {
        stickerNotSet: true
      })
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        'В следующем сообщении отправьте стикер который я должен использовать'
      )
    } catch (error) {
      console.error('Error add_sticker_pack:', error)
    }
  })

  bot.command('set_new_prompt', async (ctx) => {
    try {
      await sessionController.getSession(ctx.chat.id)
      await sessionController.updateSession(ctx.chat.id, {
        promptNotSet: true
      })
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        'В следующем сообщении отправьте системный промпт'
      )
    } catch (error) {
      console.error('Error updating prompt:', error)
    }
  })

  bot.command('show_memories', async (ctx) => {
    try {
      const chatId = ctx.chat.id
      const sessionData = await sessionController.getSession(chatId)

      if (!sessionData.memories || sessionData.memories.length === 0) {
        await ctx.telegram.sendMessage(
          chatId,
          'У меня пока нет сохраненных воспоминаний об этом чате.'
        )
        return
      }

      const memories = sessionData.memories
        .map((memory, index) => `${index + 1}. ${memory.content}`)
        .join('')

      await ctx.telegram.sendMessage(chatId, `Вот что я запомнил:${memories}`)
    } catch (error) {
      console.error('Error showing memories:', error)
    }
  })

  bot.command('clear_memories', async (ctx) => {
    try {
      const chatId = ctx.chat.id

      await sessionController.updateSession(chatId, {
        memories: []
      })

      await ctx.telegram.sendMessage(
        chatId,
        'Все сохраненные воспоминания были удалены.'
      )
    } catch (error) {
      console.error('Error clearing memories:', error)
    }
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
      const userMessage = ('text' in ctx.message && ctx.message.text) || ''
      const isPrivate = false // (ctx.chat.type = 'private')
      const isMessageToBot = !!userMessage.match(botName)
      const sessionData = await sessionController.getSession(chatId)
      const shouldReply = isReply(sessionData.replyChance)

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
            stickersPacks: ['kreksshpeks'],
            stickerNotSet: false
          })
        }
      }

      if (!shouldReply && !isMessageToBot && !isPrivate) return

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
          const base64Image = Buffer.from(response.data).toString('base64')
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
        .reverse()
        .join(';')

      const botMessages = await openAi(
        `${newMessage.name}[${newMessage.time}] написал: ${newMessage.text}`,
        recentMessages,
        sessionData.prompt,
        image,
        formattedMemories
      )

      const memoryItems = botMessages.filter((item) => item.type === 'memory')
      if (memoryItems.length > 0) {
        for (const memoryItem of memoryItems) {
          if (memoryItem.type === 'memory') {
            await sessionController.addMemory(
              chatId,
              memoryItem.content,
              8 // default high importance for AI-identified memories
            )
          }
        }
      }

      const responseMessages = botMessages.filter((item) => item.type !== 'memory')

      const botHistory = {
        text: responseMessages
          .filter(({ type }) => type === 'text')
          .map(({ content }) => content)
          .join(''),
        time: currentTime.toISOString(),
        name: 'Иван Разумов'
      }

      await sessionController.updateSession(chatId, {
        userMessages: [...sessionData.userMessages, newMessage, botHistory]
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
