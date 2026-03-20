import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Context } from 'telegraf'
import type { AxiosInstance } from 'axios'
import { handleIncomingMessage } from '../../src/bot/messageHandler'
import type { SessionData } from '../../src/types'
import * as historyModule from '../../src/bot/history'

// Mocks for modules used inside messageHandler
vi.mock('../../src/bot/sessionGuards', () => ({
  ensureSessionReady: vi.fn().mockResolvedValue(true)
}))

vi.mock('../../src/bot/media', () => ({
  collectImageInputs: vi.fn().mockResolvedValue([])
}))

vi.mock('../../src/bot/history', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/bot/history')>()
  return {
    ...actual,
    sanitizeHistoryMessages: vi.fn((msgs: any) => msgs),
    buildAssistantHistoryMessages: vi.fn(() => [
      {
        role: 'assistant',
        content: [{ type: 'output_text', text: 'A1' }]
      }
    ])
  }
})

vi.mock('../../src/bot/messageBuilder', () => ({
  composeUserContent: vi.fn(({ username, trimmedMessage }: any) => [
    { type: 'input_text', text: `${username}: ${trimmedMessage}` }
  ]),
  createUserMessage: vi.fn((content: any) => ({ role: 'user', content })),
  createLoggedMessage: vi.fn((m: any) => m),
  extractMemoryItems: vi.fn((msgs: any[]) => msgs.filter((m) => m.type === 'memory')),
  filterResponseMessages: vi.fn((msgs: any[]) => msgs.filter((m) => m.type !== 'memory'))
}))

vi.mock('../../src/bot/responseDispatcher', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/bot/responseDispatcher')>()
  return {
    ...actual,
    dispatchResponsesSequentially: vi.fn().mockResolvedValue(undefined)
  }
})

vi.mock('../../src/utils', () => ({
  delay: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../src/bot/memoryObserver', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/bot/memoryObserver')>()
  return {
    ...actual,
    extractBackgroundMemories: vi.fn().mockResolvedValue([])
  }
})

// Helpers to access mocks
const ensureSessionReady = (await import('../../src/bot/sessionGuards')).ensureSessionReady as unknown as ReturnType<typeof vi.fn>
const collectImageInputs = (await import('../../src/bot/media')).collectImageInputs as unknown as ReturnType<typeof vi.fn>
const sanitizeHistoryMessages = (await import('../../src/bot/history')).sanitizeHistoryMessages as unknown as ReturnType<typeof vi.fn>
const buildAssistantHistoryMessages = (await import('../../src/bot/history')).buildAssistantHistoryMessages as unknown as ReturnType<typeof vi.fn>
const composeUserContent = (await import('../../src/bot/messageBuilder')).composeUserContent as unknown as ReturnType<typeof vi.fn>
const createUserMessage = (await import('../../src/bot/messageBuilder')).createUserMessage as unknown as ReturnType<typeof vi.fn>
const createLoggedMessage = (await import('../../src/bot/messageBuilder')).createLoggedMessage as unknown as ReturnType<typeof vi.fn>
const extractMemoryItems = (await import('../../src/bot/messageBuilder')).extractMemoryItems as unknown as ReturnType<typeof vi.fn>
const filterResponseMessages = (await import('../../src/bot/messageBuilder')).filterResponseMessages as unknown as ReturnType<typeof vi.fn>
const dispatchResponsesSequentially = (await import('../../src/bot/responseDispatcher')).dispatchResponsesSequentially as unknown as ReturnType<typeof vi.fn>
const delay = (await import('../../src/utils')).delay as unknown as ReturnType<typeof vi.fn>
const extractBackgroundMemories = (await import('../../src/bot/memoryObserver'))
  .extractBackgroundMemories as unknown as ReturnType<typeof vi.fn>

describe('messageHandler', () => {
  let ctx: Partial<Context>
  let env: Env
  let responseApi: any
  let embeddingService: any
  let sessionController: any
  let userService: any
  let telegramFileClient: AxiosInstance

  beforeEach(() => {
    vi.clearAllMocks()

    ctx = {
      from: { id: 42, username: 'alice', is_bot: false } as any,
      chat: { id: 777 } as any,
      message: {
        text: 'hello bot message',
        message_id: 10,
        from: {
          id: 42,
          username: 'alice',
          first_name: undefined,
          last_name: undefined,
          is_bot: false
        }
      } as any,
      telegram: {
        sendChatAction: vi.fn().mockResolvedValue(undefined)
      } as any
    }

    env = { BOT_TOKEN: 'token' }

    responseApi = vi.fn().mockResolvedValue([
      { type: 'memory', content: 'remember this' },
      { type: 'text', content: 'Hi human' }
    ])

    embeddingService = {
      saveMessage: vi.fn().mockResolvedValue(undefined),
      saveSummary: vi.fn().mockResolvedValue(undefined),
      fetchRelevantMessages: vi.fn().mockResolvedValue([
        { id: '1', content: 'old msg', score: 0.9 }
      ]),
      fetchRelevantSummaries: vi.fn().mockResolvedValue([
        { id: '1', content: 'summary', score: 0.9 }
      ])
    }

    sessionController = {
      getSession: vi.fn().mockResolvedValue({
        userMessages: [],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: 'gpt-5-mini-2025-08-07',
        memories: [],
        chat_settings: {
          reply_only_in_thread: false,
          directed_reply_gating: false,
          send_message_option: {}
        }
      } as SessionData),
      getFormattedMemories: vi.fn().mockReturnValue([
        { role: 'system', content: [{ type: 'input_text', text: 'mem' }] }
      ]),
      addMemory: vi.fn().mockResolvedValue(undefined),
      updateSession: vi.fn().mockResolvedValue(undefined),
      touchThreadActivity: vi.fn().mockResolvedValue(undefined),
      removeProactivePendingKey: vi.fn().mockResolvedValue(undefined)
    }

    userService = {
      registerOrGetUser: vi.fn().mockResolvedValue(undefined),
      hasEnoughCoins: vi.fn().mockResolvedValue(true)
    }

    telegramFileClient = {} as any
  })

  const mockOpenAI = {
    responses: {
      create: vi.fn().mockResolvedValue({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: 'Test summary'
              }
            ]
          }
        ]
      })
    },
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: '{"addressed":true}' } }]
        })
      }
    }
  } as any

  describe('happy path with history enabled', () => {
    it('builds message, calls API, stores memory, updates session, dispatches', async () => {
      await handleIncomingMessage(ctx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(userService.registerOrGetUser).toHaveBeenCalledWith({
        id: 42,
        username: 'alice',
        first_name: undefined,
        last_name: undefined
      })

      expect(sessionController.getSession).toHaveBeenCalledWith(777)
      expect(sessionController.touchThreadActivity).toHaveBeenCalledWith(
        777,
        '__default'
      )
      expect(sessionController.removeProactivePendingKey).toHaveBeenCalledWith(
        777,
        '__default'
      )
      expect(extractBackgroundMemories).not.toHaveBeenCalled()
      expect(ensureSessionReady).toHaveBeenCalled()
      expect(collectImageInputs).toHaveBeenCalled()
      expect(composeUserContent).toHaveBeenCalled()
      expect(createUserMessage).toHaveBeenCalled()
      expect(createLoggedMessage).toHaveBeenCalled()

      // history related
      expect(embeddingService.fetchRelevantSummaries).toHaveBeenCalledWith(777, 'hello bot message')
      expect(sessionController.getFormattedMemories).toHaveBeenCalled()

      // API called with options
      expect(responseApi).toHaveBeenCalled()
      const [, options] = responseApi.mock.calls[0]
      expect(options).toEqual({ hasEnoughCoins: true, model: 'gpt-5-mini-2025-08-07', prompt: '' })

      // After API
      expect(extractMemoryItems).toHaveBeenCalled()
      expect(filterResponseMessages).toHaveBeenCalled()

      // session update
      expect(sanitizeHistoryMessages).toHaveBeenCalled()
      expect(buildAssistantHistoryMessages).toHaveBeenCalled()
      expect(sessionController.updateSession).toHaveBeenCalledWith(777, expect.objectContaining({ userMessages: expect.any(Array) }))

      // dispatch and UX
      expect(ctx.telegram!.sendChatAction).toHaveBeenCalledWith(777, 'typing', {})
      expect(delay).toHaveBeenCalled()
      expect(dispatchResponsesSequentially).toHaveBeenCalled()
    })
  })

  describe('early return cases', () => {
    it('returns early when message is from a bot', async () => {
      const botCtx = { ...ctx, message: { ...(ctx.message as any), from: { id: 1, is_bot: true } } } as any

      await handleIncomingMessage(botCtx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(userService.registerOrGetUser).not.toHaveBeenCalled()
      expect(sessionController.getSession).not.toHaveBeenCalled()
    })

    it('returns early when no chat id', async () => {
      const noChatCtx = { ...ctx, chat: undefined } as any
      await handleIncomingMessage(noChatCtx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(userService.registerOrGetUser).toHaveBeenCalled()
      expect(sessionController.getSession).not.toHaveBeenCalled()
    })

    it('reply_only_in_thread prevents response outside the thread', async () => {
      sessionController.getSession.mockResolvedValueOnce({
        userMessages: [],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: false,
        model: 'gpt-5-mini-2025-08-07',
        memories: [],
        chat_settings: {
          reply_only_in_thread: true,
          thread_id: 999,
          send_message_option: {}
        }
      } as SessionData)

      // message has no thread id, so should not reply
      await handleIncomingMessage(ctx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(responseApi).not.toHaveBeenCalled()
      expect(dispatchResponsesSequentially).not.toHaveBeenCalled()
      expect(extractBackgroundMemories).not.toHaveBeenCalled()
    })

    it('reply_only_in_thread still appends user message to history when toggle_history is on', async () => {
      sessionController.getSession.mockResolvedValueOnce({
        userMessages: [{ role: 'user', content: [{ type: 'input_text', text: 'prior' }] }],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: 'gpt-5-mini-2025-08-07',
        memories: [],
        chat_settings: {
          reply_only_in_thread: true,
          thread_id: 999,
          send_message_option: {}
        }
      } as SessionData)

      extractBackgroundMemories.mockResolvedValueOnce(['bg fact'])

      await handleIncomingMessage(ctx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(responseApi).not.toHaveBeenCalled()
      expect(dispatchResponsesSequentially).not.toHaveBeenCalled()
      expect(sessionController.updateSession).toHaveBeenCalledWith(
        777,
        expect.objectContaining({
          userMessages: expect.arrayContaining([
            expect.objectContaining({ role: 'user' })
          ])
        })
      )
      expect(embeddingService.fetchRelevantSummaries).not.toHaveBeenCalled()
      expect(extractBackgroundMemories).toHaveBeenCalled()
      expect(sessionController.addMemory).toHaveBeenCalledWith(777, 'bg fact')
    })
  })

  describe('responseApi returns null', () => {
    it('stops flow when API returns null', async () => {
      responseApi.mockResolvedValueOnce(null)

      await handleIncomingMessage(ctx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(dispatchResponsesSequentially).not.toHaveBeenCalled()
      expect(sessionController.touchThreadActivity).toHaveBeenCalledWith(
        777,
        '__default'
      )
      expect(sessionController.removeProactivePendingKey).toHaveBeenCalledWith(
        777,
        '__default'
      )
      expect(sessionController.updateSession).not.toHaveBeenCalled()
    })
  })

  describe('edge cases and missing branches', () => {
    it('should return early when ctx.from is undefined after sessionReady', async () => {
      const ctxWithoutFrom = { ...ctx, from: undefined } as any
      ensureSessionReady.mockResolvedValueOnce(true)

      await handleIncomingMessage(ctxWithoutFrom as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(responseApi).not.toHaveBeenCalled()
    })

    it('should not fetch summaries when toggle_history is false', async () => {
      sessionController.getSession.mockResolvedValueOnce({
        userMessages: [],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: false,
        model: 'gpt-5-mini-2025-08-07',
        memories: [],
        chat_settings: {
          reply_only_in_thread: false,
          send_message_option: {}
        }
      } as SessionData)

      await handleIncomingMessage(ctx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(embeddingService.fetchRelevantSummaries).not.toHaveBeenCalled()
      expect(sessionController.getFormattedMemories).not.toHaveBeenCalled()
    })

    it('should handle caption when message has caption', async () => {
      const ctxWithCaption = {
        ...ctx,
        message: {
          ...(ctx.message as any),
          caption: 'image caption'
        }
      } as any

      await handleIncomingMessage(ctxWithCaption as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(composeUserContent).toHaveBeenCalledWith({
        username: 'alice',
        trimmedMessage: 'image caption',
        imageInputs: []
      })
    })

    it('should handle message with both text and caption', async () => {
      const ctxWithBoth = {
        ...ctx,
        message: {
          ...(ctx.message as any),
          text: 'hello',
          caption: 'image caption'
        }
      } as any

      await handleIncomingMessage(ctxWithBoth as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(composeUserContent).toHaveBeenCalledWith({
        username: 'alice',
        trimmedMessage: 'image caption',
        imageInputs: []
      })
    })

    it('should create summary when messages length >= 20', async () => {
      const saveSummary = embeddingService.saveSummary

      const manyMessages = Array(25).fill({
        role: 'user',
        content: [{ type: 'input_text', text: 'msg' }]
      })

      sanitizeHistoryMessages.mockReturnValueOnce(manyMessages)

      sessionController.getSession.mockResolvedValueOnce({
        userMessages: manyMessages.slice(0, 5),
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: 'gpt-5-mini-2025-08-07',
        memories: [],
        chat_settings: {
          reply_only_in_thread: false,
          send_message_option: {}
        }
      } as SessionData)

      await handleIncomingMessage(ctx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(saveSummary).toHaveBeenCalled()
      expect(sessionController.updateSession).toHaveBeenCalled()
    })

    it('should handle summary creation error gracefully', async () => {
      const summarySpy = vi
        .spyOn(historyModule, 'createConversationSummary')
        .mockRejectedValueOnce(new Error('Summary failed'))

      const manyMessages = Array(25).fill({
        role: 'user',
        content: [{ type: 'input_text', text: 'msg' }]
      })

      sanitizeHistoryMessages.mockReturnValueOnce(manyMessages)

      sessionController.getSession.mockResolvedValueOnce({
        userMessages: manyMessages.slice(0, 5),
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: true,
        model: 'gpt-5-mini-2025-08-07',
        memories: [],
        chat_settings: {
          reply_only_in_thread: false,
          send_message_option: {}
        }
      } as SessionData)

      await handleIncomingMessage(ctx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(sessionController.updateSession).toHaveBeenCalledWith(777, {
        userMessages: expect.arrayContaining([])
      })
      summarySpy.mockRestore()
    })

    it('should not create summary when messages length < 20', async () => {
      const summarySpy = vi.spyOn(historyModule, 'createConversationSummary')

      const fewMessages = Array(15).fill({
        role: 'user',
        content: [{ type: 'input_text', text: 'msg' }]
      })

      sanitizeHistoryMessages.mockReturnValue(fewMessages)

      await handleIncomingMessage(ctx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(summarySpy).not.toHaveBeenCalled()
      summarySpy.mockRestore()
      // The updateSession will be called with messages including the new one and assistant response
      expect(sessionController.updateSession).toHaveBeenCalled()
      const updateCall = sessionController.updateSession.mock.calls.find(
        (call: any[]) => call[0] === 777 && call[1].userMessages
      )
      expect(updateCall).toBeDefined()
      expect(updateCall[1].userMessages.length).toBeGreaterThanOrEqual(15)
    })

    it('should handle relativeMessage with undefined items', async () => {
      embeddingService.fetchRelevantSummaries.mockResolvedValueOnce([
        { id: '1', content: 'summary', score: 0.9 },
        undefined,
        { id: '2', content: 'summary2', score: 0.8 }
      ])

      await handleIncomingMessage(ctx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(responseApi).toHaveBeenCalled()
      const [messages] = responseApi.mock.calls[0]
      // Should handle undefined items in relativeMessage
      expect(messages.length).toBeGreaterThan(0)
    })

    it('should handle relativeMessage with missing content', async () => {
      embeddingService.fetchRelevantSummaries.mockResolvedValueOnce([
        { id: '1', score: 0.9 } // missing content
      ])

      await handleIncomingMessage(ctx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(responseApi).toHaveBeenCalled()
    })

    it('should handle user registration error gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      userService.registerOrGetUser.mockRejectedValueOnce(new Error('DB error'))

      await handleIncomingMessage(ctx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error registering user:', expect.any(Error))
      // Should continue processing despite registration error
      expect(sessionController.getSession).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('should handle sessionReady returning false', async () => {
      ensureSessionReady.mockResolvedValueOnce(false)

      await handleIncomingMessage(ctx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(responseApi).not.toHaveBeenCalled()
      expect(dispatchResponsesSequentially).not.toHaveBeenCalled()
    })

    it('should handle reply_only_in_thread when message is in thread', async () => {
      sessionController.getSession.mockResolvedValueOnce({
        userMessages: [],
        stickersPacks: [],
        prompt: '',
        firstTime: false,
        promptNotSet: false,
        stickerNotSet: false,
        toggle_history: false,
        model: 'gpt-5-mini-2025-08-07',
        memories: [],
        chat_settings: {
          reply_only_in_thread: true,
          thread_id: 999,
          send_message_option: {}
        }
      } as SessionData)

      const ctxInThread = {
        ...ctx,
        message: {
          ...(ctx.message as any),
          message_thread_id: 999
        }
      }

      await handleIncomingMessage(ctxInThread as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(responseApi).toHaveBeenCalled()
      expect(dispatchResponsesSequentially).toHaveBeenCalled()
    })
  })

  describe('directed_reply_gating', () => {
    const baseSession = (): SessionData => ({
      userMessages: [],
      stickersPacks: [],
      prompt: '',
      firstTime: false,
      promptNotSet: false,
      stickerNotSet: false,
      toggle_history: true,
      model: 'gpt-5-mini-2025-08-07',
      memories: [],
      chat_settings: {
        directed_reply_gating: true,
        send_message_option: { message_thread_id: 99 }
      }
    })

    beforeEach(() => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: '{"addressed":true}' } }]
      })
    })

    it('private chat: replies without classifier', async () => {
      sessionController.getSession.mockResolvedValueOnce(baseSession())
      const privateCtx = {
        ...ctx,
        chat: { id: 777, type: 'private' as const },
        botInfo: {
          id: 1,
          is_bot: true,
          first_name: 'B',
          username: 'thebot'
        }
      }

      await handleIncomingMessage(privateCtx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled()
      expect(responseApi).toHaveBeenCalled()
    })

    it('supergroup: classifier false skips reply', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: '{"addressed":false}' } }]
      })
      sessionController.getSession.mockResolvedValueOnce(baseSession())
      const groupCtx = {
        ...ctx,
        chat: { id: 777, type: 'supergroup' as const },
        botInfo: {
          id: 1,
          is_bot: true,
          first_name: 'B',
          username: 'thebot'
        },
        message: {
          ...(ctx.message as object),
          text: 'just humans talking'
        }
      }

      await handleIncomingMessage(groupCtx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(responseApi).not.toHaveBeenCalled()
      expect(dispatchResponsesSequentially).not.toHaveBeenCalled()
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled()
      expect(extractBackgroundMemories).toHaveBeenCalled()
    })

    it('supergroup: when not replying and history off, skips background memories', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: '{"addressed":false}' } }]
      })
      sessionController.getSession.mockResolvedValueOnce({
        ...baseSession(),
        toggle_history: false
      })
      const groupCtx = {
        ...ctx,
        chat: { id: 777, type: 'supergroup' as const },
        botInfo: {
          id: 1,
          is_bot: true,
          first_name: 'B',
          username: 'thebot'
        },
        message: {
          ...(ctx.message as object),
          text: 'humans only'
        }
      }

      await handleIncomingMessage(groupCtx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(extractBackgroundMemories).not.toHaveBeenCalled()
    })

    it('supergroup: classifier failure fail-opens to reply', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValueOnce(
        new Error('classifier down')
      )
      sessionController.getSession.mockResolvedValueOnce(baseSession())
      const groupCtx = {
        ...ctx,
        chat: { id: 777, type: 'supergroup' as const },
        botInfo: {
          id: 1,
          is_bot: true,
          first_name: 'B',
          username: 'thebot'
        }
      }

      await handleIncomingMessage(groupCtx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(responseApi).toHaveBeenCalled()
      expect(dispatchResponsesSequentially).toHaveBeenCalled()
      expect(extractBackgroundMemories).not.toHaveBeenCalled()
    })

    it('supergroup: mention skips classifier', async () => {
      sessionController.getSession.mockResolvedValueOnce(baseSession())
      const groupCtx = {
        ...ctx,
        chat: { id: 777, type: 'supergroup' as const },
        botInfo: {
          id: 1,
          is_bot: true,
          first_name: 'B',
          username: 'thebot'
        },
        message: {
          message_id: 10,
          text: '@thebot hello',
          entities: [{ type: 'mention' as const, offset: 0, length: 7 }],
          from: (ctx.message as any).from
        }
      }

      await handleIncomingMessage(groupCtx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled()
      expect(responseApi).toHaveBeenCalled()
    })

    it('supergroup: passes outbound thread and history prefix', async () => {
      sessionController.getSession.mockResolvedValueOnce(baseSession())
      const groupCtx = {
        ...ctx,
        chat: { id: 777, type: 'supergroup' as const },
        botInfo: {
          id: 1,
          is_bot: true,
          first_name: 'B',
          username: 'thebot'
        },
        message: {
          message_id: 10,
          text: '@thebot hello',
          message_thread_id: 42,
          entities: [{ type: 'mention' as const, offset: 0, length: 7 }],
          from: (ctx.message as any).from
        }
      }

      await handleIncomingMessage(groupCtx as Context, {
        env,
        responseApi,
        embeddingService,
        sessionController,
        userService,
        telegramFileClient,
        openai: mockOpenAI
      })

      expect(composeUserContent).toHaveBeenCalledWith(
        expect.objectContaining({
          historyThreadPrefix: '[forum_thread_id=42]\n'
        })
      )
      expect(dispatchResponsesSequentially).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ outboundMessageThreadId: 42 })
      )
      expect(sessionController.touchThreadActivity).toHaveBeenCalledWith(
        777,
        '42'
      )
      expect(sessionController.removeProactivePendingKey).toHaveBeenCalledWith(
        777,
        '42'
      )
    })
  })
})
