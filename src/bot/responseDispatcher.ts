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
  /**
   * undefined: use session `send_message_option` only (legacy).
   * number: directed mode — send in this forum topic.
   * null: directed mode but trigger had no topic — strip fixed `message_thread_id` from options.
   */
  outboundMessageThreadId?: number | null
}

export function resolveSendExtras(
  sessionData: SessionData,
  outboundMessageThreadId: number | null | undefined
): Record<string, unknown> {
  const base = {
    ...(sessionData.chat_settings.send_message_option ?? {})
  } as Record<string, unknown>
  if (outboundMessageThreadId === undefined) return base
  if (outboundMessageThreadId === null) {
    const { message_thread_id: _t, ...rest } = base
    return rest
  }
  return { ...base, message_thread_id: outboundMessageThreadId }
}

export const dispatchResponsesSequentially = async (
  responses: NonMemoryMessage[],
  deps: ResponseDispatcherDeps
) => {
  if (!deps.ctx.chat) return

  const sendExtras = resolveSendExtras(
    deps.sessionData,
    deps.outboundMessageThreadId
  )

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
        send_message_option: sendExtras
      })

      await deps.ctx.telegram.sendSticker(
        deps.ctx.chat.id,
        stickerByEmoji.file_id,
        sendExtras
      )
    } else if (type === 'text') {
      console.log({
        log: 'sendMessage',
        chatId: deps.ctx.chat.id,
        content,
        send_message_option: sendExtras
      })

      await deps.ctx.telegram.sendMessage(deps.ctx.chat.id, content, {
        ...sendExtras,
        parse_mode: 'Markdown'
      })
    } else if (type === 'reaction') {
      const messageId = deps.ctx.message?.message_id
      if (!messageId) {
        console.warn('Cannot set message reaction: message_id is undefined')
        continue
      }

      console.log({
        log: 'setMessageReaction',
        chatId: deps.ctx.chat.id,
        content,
        message_id: messageId
      })

      await deps.ctx.telegram.setMessageReaction(deps.ctx.chat.id, messageId, [
        {
          type: 'emoji',
          emoji: content
        }
      ])
    } else if (type === 'image') {
      if (!deps.ctx.from) {
        console.warn('Cannot deduct coins: ctx.from is undefined')
        continue
      }
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

      const tid = sendExtras.message_thread_id
      if (typeof tid === 'number') {
        form.append('message_thread_id', String(tid))
      } else if (
        deps.outboundMessageThreadId === undefined &&
        deps.sessionData.chat_settings.thread_id
      ) {
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
