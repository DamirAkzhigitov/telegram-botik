import type { Context } from 'telegraf'
import type { SessionData, Sticker } from '../types'
import { base64ToBlob, findByEmoji, getRandomValueArr } from '../utils'
import type { UserService } from '../service/UserService'
import type { NonMemoryMessage } from './messageBuilder'

interface ResponseDispatcherDeps {
  ctx: Context
  sessionData: SessionData
  userService: UserService
  env: Env
}

export const dispatchResponsesSequentially = async (
  responses: NonMemoryMessage[],
  deps: ResponseDispatcherDeps
) => {
  if (!deps.ctx.chat) return

  for (const { content, type } of responses) {
    if (type === 'emoji') {
      const stickerSet = getRandomValueArr(deps.sessionData.stickersPacks)
      const response = await deps.ctx.telegram.getStickerSet(stickerSet)
      const stickerByEmoji = findByEmoji(
        response.stickers as Sticker[],
        content
      )
      console.log({
        log: 'sendSticker',
        chatId: deps.ctx.chat.id,
        content: stickerByEmoji.file_id,
        send_message_option: deps.sessionData.chat_settings.send_message_option
      })

      await deps.ctx.telegram.sendSticker(
        deps.ctx.chat.id,
        stickerByEmoji.file_id,
        deps.sessionData.chat_settings.send_message_option
      )
    } else if (type === 'text') {
      console.log({
        log: 'sendMessage',
        chatId: deps.ctx.chat.id,
        content,
        send_message_option: deps.sessionData.chat_settings.send_message_option
      })

      await deps.ctx.telegram.sendMessage(deps.ctx.chat.id, content, {
        ...deps.sessionData.chat_settings.send_message_option,
        parse_mode: 'Markdown'
      })
    } else if (type === 'reaction') {
      console.log({
        log: 'setMessageReaction',
        chatId: deps.ctx.chat.id,
        content,
        message_id: deps.ctx.message?.message_id
      })

      await deps.ctx.telegram.setMessageReaction(
        deps.ctx.chat.id,
        deps.ctx.message?.message_id,
        [
          {
            type: 'emoji',
            emoji: content
          }
        ]
      )
    } else if (type === 'image') {
      await deps.userService.deductCoins(
        deps.ctx.from.id,
        1,
        'image_generation'
      )
      const form = new FormData()

      const blob = base64ToBlob(content, 'image/jpeg')
      const file = new File([blob], 'image.jpg', { type: 'image/jpeg' })

      form.append('chat_id', String(deps.ctx.chat.id))
      form.append('photo', file)

      if (deps.sessionData.chat_settings.thread_id) {
        form.append(
          'message_thread_id',
          String(deps.sessionData.chat_settings.thread_id)
        )
      }

      await fetch(
        `https://api.telegram.org/bot${deps.env.BOT_TOKEN}/sendPhoto`,
        {
          method: 'POST',
          body: form
        }
      )
    }
  }
}
