import type { Context } from 'telegraf'
import { findAllowedModel, resolveModelChoice } from '../constants/models'
import type { SessionController } from '../service/SessionController'
import type { SessionData } from '../types'

interface SessionGuardDeps {
  ctx: Context
  sessionController: SessionController
  sessionData: SessionData
  chatId: number
  userMessage: string
}

export const ensureSessionReady = async ({
  ctx,
  sessionController,
  sessionData,
  chatId,
  userMessage
}: SessionGuardDeps): Promise<boolean> => {
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

    await ctx.telegram.sendMessage(
      chatId,
      reply,
      sessionData.chat_settings.send_message_option
    )

    sessionData.model = modelToUse
    return false
  }

  if (sessionData.firstTime) {
    await sessionController.updateSession(chatId, {
      firstTime: false
    })
    sessionData.firstTime = false
  }

  if (sessionData.promptNotSet) {
    await sessionController.updateSession(chatId, {
      prompt: userMessage,
      promptNotSet: false
    })

    await ctx.telegram.sendMessage(
      chatId,
      'Системный промт обновлен!',
      sessionData.chat_settings.send_message_option
    )

    sessionData.prompt = userMessage
    sessionData.promptNotSet = false
    return false
  }

  if (sessionData.stickerNotSet) {
    const message = ctx.message as any
    if (message?.sticker?.set_name) {
      const onlyDefault = sessionController.isOnlyDefaultStickerPack()
      let newPack = sessionData.stickersPacks

      if (onlyDefault) {
        newPack = [message.sticker.set_name]
      } else {
        newPack = [...newPack, message.sticker.set_name]
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
      sessionData.stickersPacks = newPack
      sessionData.stickerNotSet = false
      return false
    }

    await sessionController.updateSession(chatId, {
      stickersPacks: ['gufenpchela'],
      stickerNotSet: false
    })
    sessionData.stickersPacks = ['gufenpchela']
    sessionData.stickerNotSet = false
  }

  return true
}
