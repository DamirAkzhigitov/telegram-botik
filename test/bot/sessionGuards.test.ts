import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Context } from 'telegraf'
import { ensureSessionReady } from '../../src/bot/sessionGuards'
import type { SessionData } from '../../src/types'
import { ALLOWED_TEXT_MODELS, DEFAULT_TEXT_MODEL } from '../../src/constants/models'

describe('ensureSessionReady', () => {
  let mockCtx: Partial<Context>
  let mockTelegram: any
  let mockSessionController: any
  let baseSession: SessionData

  beforeEach(() => {
    vi.clearAllMocks()

    mockTelegram = {
      sendMessage: vi.fn()
    }

    mockCtx = {
      telegram: mockTelegram
    }

    mockSessionController = {
      updateSession: vi.fn().mockResolvedValue(undefined),
      isOnlyDefaultStickerPack: vi.fn().mockReturnValue(true)
    }

    baseSession = {
      userMessages: [],
      stickersPacks: ['koshachiy_raskolbas'],
      prompt: '',
      firstTime: false,
      promptNotSet: false,
      stickerNotSet: false,
      toggle_history: true,
      model: DEFAULT_TEXT_MODEL,
      chat_settings: { send_message_option: {} },
      memories: []
    }
  })

  it('handles model not_set with recognized model and returns false', async () => {
    const session = { ...baseSession, model: 'not_set' as const }
    const chatId = 123
    const requestedModel = ALLOWED_TEXT_MODELS[1]

    const result = await ensureSessionReady({
      ctx: mockCtx as Context,
      sessionController: mockSessionController,
      sessionData: session,
      chatId,
      userMessage: `${requestedModel} please`
    })

    expect(mockSessionController.updateSession).toHaveBeenCalledWith(chatId, {
      model: requestedModel
    })
    expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
      chatId,
      `Модель обновлена на ${requestedModel}`,
      session.chat_settings.send_message_option
    )
    expect(session.model).toBe(requestedModel)
    expect(result).toBe(false)
  })

  it('handles model not_set with unrecognized model and returns false', async () => {
    const session = { ...baseSession, model: 'not_set' as const }
    const chatId = 123

    const result = await ensureSessionReady({
      ctx: mockCtx as Context,
      sessionController: mockSessionController,
      sessionData: session,
      chatId,
      userMessage: 'unknown-model xyz'
    })

    expect(mockSessionController.updateSession).toHaveBeenCalledWith(chatId, {
      model: DEFAULT_TEXT_MODEL
    })
    expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
      chatId,
      `Модель не распознана. Используем ${DEFAULT_TEXT_MODEL}.`,
      session.chat_settings.send_message_option
    )
    expect(session.model).toBe(DEFAULT_TEXT_MODEL)
    expect(result).toBe(false)
  })

  it('updates firstTime flag when set and proceeds (returns true if nothing else blocks)', async () => {
    const session = { ...baseSession, firstTime: true }
    const chatId = 999

    const result = await ensureSessionReady({
      ctx: mockCtx as Context,
      sessionController: mockSessionController,
      sessionData: session,
      chatId,
      userMessage: 'hello'
    })

    expect(mockSessionController.updateSession).toHaveBeenCalledWith(chatId, {
      firstTime: false
    })
    expect(session.firstTime).toBe(false)
    expect(result).toBe(true)
  })

  it('handles promptNotSet by updating prompt, notifying, and returning false', async () => {
    const session = { ...baseSession, promptNotSet: true }
    const chatId = 42
    const newPrompt = 'You are a helpful assistant.'

    const result = await ensureSessionReady({
      ctx: mockCtx as Context,
      sessionController: mockSessionController,
      sessionData: session,
      chatId,
      userMessage: newPrompt
    })

    expect(mockSessionController.updateSession).toHaveBeenCalledWith(chatId, {
      prompt: newPrompt,
      promptNotSet: false
    })
    expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
      chatId,
      'Системный промт обновлен!',
      session.chat_settings.send_message_option
    )
    expect(session.prompt).toBe(newPrompt)
    expect(session.promptNotSet).toBe(false)
    expect(result).toBe(false)
  })

  it('handles stickerNotSet when sticker present and only default pack: replaces pack and returns false', async () => {
    const session = { ...baseSession, stickerNotSet: true }
    const chatId = 7
    mockSessionController.isOnlyDefaultStickerPack.mockReturnValue(true)

    const ctxWithSticker: Partial<Context> = {
      ...mockCtx,
      message: {
        sticker: { set_name: 'my_pack' }
      } as any
    }

    const result = await ensureSessionReady({
      ctx: ctxWithSticker as Context,
      sessionController: mockSessionController,
      sessionData: session,
      chatId,
      userMessage: 'ignored'
    })

    expect(mockSessionController.updateSession).toHaveBeenCalledWith(chatId, {
      stickersPacks: ['my_pack'],
      stickerNotSet: false
    })
    expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
      chatId,
      'Стикер пак был добавлен!',
      session.chat_settings.send_message_option
    )
    expect(session.stickersPacks).toEqual(['my_pack'])
    expect(session.stickerNotSet).toBe(false)
    expect(result).toBe(false)
  })

  it('handles stickerNotSet when sticker present and multiple packs: appends pack and returns false', async () => {
    const session = {
      ...baseSession,
      stickersPacks: ['packA', 'packB'],
      stickerNotSet: true
    }
    const chatId = 8
    mockSessionController.isOnlyDefaultStickerPack.mockReturnValue(false)

    const ctxWithSticker: Partial<Context> = {
      ...mockCtx,
      message: {
        sticker: { set_name: 'newPack' }
      } as any
    }

    const result = await ensureSessionReady({
      ctx: ctxWithSticker as Context,
      sessionController: mockSessionController,
      sessionData: session,
      chatId,
      userMessage: 'ignored'
    })

    expect(mockSessionController.updateSession).toHaveBeenCalledWith(chatId, {
      stickersPacks: ['packA', 'packB', 'newPack'],
      stickerNotSet: false
    })
    expect(mockTelegram.sendMessage).toHaveBeenCalled()
    expect(session.stickersPacks).toEqual(['packA', 'packB', 'newPack'])
    expect(session.stickerNotSet).toBe(false)
    expect(result).toBe(false)
  })

  it('handles stickerNotSet fallback when no sticker provided: sets default pack and returns true', async () => {
    const session = { ...baseSession, stickerNotSet: true }
    const chatId = 10

    const result = await ensureSessionReady({
      ctx: mockCtx as Context,
      sessionController: mockSessionController,
      sessionData: session,
      chatId,
      userMessage: 'ignored'
    })

    expect(mockSessionController.updateSession).toHaveBeenCalledWith(chatId, {
      stickersPacks: ['gufenpchela'],
      stickerNotSet: false
    })
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled()
    expect(session.stickersPacks).toEqual(['gufenpchela'])
    expect(session.stickerNotSet).toBe(false)
    expect(result).toBe(true)
  })
})


