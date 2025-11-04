import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Context } from 'telegraf'
import type { AxiosInstance } from 'axios'
import { handleIncomingMessage } from '../../src/bot/messageHandler'
import type { SessionData } from '../../src/types'

// Mocks for modules used inside messageHandler
vi.mock('../../src/bot/sessionGuards', () => ({
  ensureSessionReady: vi.fn().mockResolvedValue(true)
}))

vi.mock('../../src/bot/media', () => ({
  collectImageInputs: vi.fn().mockResolvedValue([])
}))

vi.mock('../../src/bot/history', () => ({
  sanitizeHistoryMessages: vi.fn((msgs: any) => msgs),
  buildAssistantHistoryMessages: vi.fn(() => [
    {
      role: 'assistant',
      content: [{ type: 'output_text', text: 'A1' }]
    }
  ]),
  createConversationSummary: vi.fn().mockResolvedValue('Test summary'),
  createSummaryMessage: vi.fn(() => [
    { role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] }
  ])
}))

vi.mock('../../src/bot/messageBuilder', () => ({
  composeUserContent: vi.fn(({ username, trimmedMessage }: any) => [
    { type: 'input_text', text: `${username}: ${trimmedMessage}` }
  ]),
  createUserMessage: vi.fn((content: any) => ({ role: 'user', content })),
  createLoggedMessage: vi.fn((m: any) => m),
  extractMemoryItems: vi.fn((msgs: any[]) => msgs.filter((m) => m.type === 'memory')),
  filterResponseMessages: vi.fn((msgs: any[]) => msgs.filter((m) => m.type !== 'memory'))
}))

vi.mock('../../src/bot/responseDispatcher', () => ({
  dispatchResponsesSequentially: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../src/utils', () => ({
  delay: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../src/service/MessageBufferService', () => ({
  MessageBufferService: vi.fn().mockImplementation(() => ({
    bufferMessage: vi.fn().mockResolvedValue(undefined)
  }))
}))

// Helpers to access mocks
const ensureSessionReady = (await import('../../src/bot/sessionGuards')).ensureSessionReady as unknown as ReturnType<typeof vi.fn>
const collectImageInputs = (await import('../../src/bot/media')).collectImageInputs as unknown as ReturnType<typeof vi.fn>
const composeUserContent = (await import('../../src/bot/messageBuilder')).composeUserContent as unknown as ReturnType<typeof vi.fn>
const dispatchResponsesSequentially = (await import('../../src/bot/responseDispatcher')).dispatchResponsesSequentially as unknown as ReturnType<typeof vi.fn>


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

    env = {
      BOT_TOKEN: 'token',
      CHAT_SESSIONS_STORAGE: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn()
      } as any,
      MESSAGE_QUEUE: {
        send: vi.fn().mockResolvedValue(undefined)
      } as any
    }

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
          send_message_option: {}
        }
      } as SessionData),
      getFormattedMemories: vi.fn().mockReturnValue([
        { role: 'system', content: [{ type: 'input_text', text: 'mem' }] }
      ]),
      addMemory: vi.fn().mockResolvedValue(undefined),
      updateSession: vi.fn().mockResolvedValue(undefined)
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
    }
  } as any

  describe('happy path with history enabled', () => {
    it('buffers message instead of processing immediately', async () => {
      const { MessageBufferService } = await import('../../src/service/MessageBufferService')

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
      expect(ensureSessionReady).toHaveBeenCalled()
      expect(collectImageInputs).toHaveBeenCalled()

      // Message should be buffered, not processed immediately
      const MockedBufferService = MessageBufferService as unknown as ReturnType<typeof vi.fn>
      const bufferInstance = MockedBufferService.mock.results[0]?.value
      expect(bufferInstance?.bufferMessage).toHaveBeenCalledWith(
        777,
        expect.objectContaining({
          username: 'alice',
          content: 'hello bot message'
        }),
        10
      )

      // These should NOT be called in handleIncomingMessage anymore
      expect(composeUserContent).not.toHaveBeenCalled()
      expect(responseApi).not.toHaveBeenCalled()
      expect(dispatchResponsesSequentially).not.toHaveBeenCalled()
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
      const { MessageBufferService } = await import('../../src/service/MessageBufferService')
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

      const MockedBufferService = MessageBufferService as unknown as ReturnType<typeof vi.fn>
      const bufferInstance = MockedBufferService.mock.results[0]?.value
      expect(bufferInstance?.bufferMessage).toHaveBeenCalledWith(
        777,
        expect.objectContaining({
          username: 'alice',
          content: 'image caption',
          caption: 'image caption'
        }),
        10
      )
    })

    it('should handle message with both text and caption', async () => {
      const { MessageBufferService } = await import('../../src/service/MessageBufferService')
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

      const MockedBufferService = MessageBufferService as unknown as ReturnType<typeof vi.fn>
      const bufferInstance = MockedBufferService.mock.results[0]?.value
      expect(bufferInstance?.bufferMessage).toHaveBeenCalledWith(
        777,
        expect.objectContaining({
          username: 'alice',
          content: 'image caption', // Caption takes precedence
          caption: 'image caption'
        }),
        10
      )
    })

    it('should buffer message when messages length >= 20', async () => {
      const { MessageBufferService } = await import('../../src/service/MessageBufferService')
      const manyMessages = Array(25).fill({
        role: 'user',
        content: [{ type: 'input_text', text: 'msg' }]
      })

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

      // Summary creation happens in processQueuedMessage, not handleIncomingMessage
      const MockedBufferService = MessageBufferService as unknown as ReturnType<typeof vi.fn>
      const bufferInstance = MockedBufferService.mock.results[0]?.value
      expect(bufferInstance?.bufferMessage).toHaveBeenCalled()
    })

    it('should buffer message even when session has many messages', async () => {
      const { MessageBufferService } = await import('../../src/service/MessageBufferService')
      const manyMessages = Array(25).fill({
        role: 'user',
        content: [{ type: 'input_text', text: 'msg' }]
      })

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

      // Summary creation error handling happens in processQueuedMessage
      const MockedBufferService = MessageBufferService as unknown as ReturnType<typeof vi.fn>
      const bufferInstance = MockedBufferService.mock.results[0]?.value
      expect(bufferInstance?.bufferMessage).toHaveBeenCalled()
    })

    it('should buffer message when messages length < 20', async () => {
      const { MessageBufferService } = await import('../../src/service/MessageBufferService')
      const fewMessages = Array(15).fill({
        role: 'user',
        content: [{ type: 'input_text', text: 'msg' }]
      })

      sessionController.getSession.mockResolvedValueOnce({
        userMessages: fewMessages,
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

      // Summary creation happens in processQueuedMessage, not handleIncomingMessage
      const MockedBufferService = MessageBufferService as unknown as ReturnType<typeof vi.fn>
      const bufferInstance = MockedBufferService.mock.results[0]?.value
      expect(bufferInstance?.bufferMessage).toHaveBeenCalled()
      expect(sessionController.updateSession).not.toHaveBeenCalled()
    })

    it('should buffer message even with relevant summaries', async () => {
      const { MessageBufferService } = await import('../../src/service/MessageBufferService')
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

      // Relative message handling happens in processQueuedMessage
      expect(responseApi).not.toHaveBeenCalled()
      const MockedBufferService = MessageBufferService as unknown as ReturnType<typeof vi.fn>
      const bufferInstance = MockedBufferService.mock.results[0]?.value
      expect(bufferInstance?.bufferMessage).toHaveBeenCalled()
    })

    it('should buffer message even with missing content in summaries', async () => {
      const { MessageBufferService } = await import('../../src/service/MessageBufferService')
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

      // Missing content handling happens in processQueuedMessage
      expect(responseApi).not.toHaveBeenCalled()
      const MockedBufferService = MessageBufferService as unknown as ReturnType<typeof vi.fn>
      const bufferInstance = MockedBufferService.mock.results[0]?.value
      expect(bufferInstance?.bufferMessage).toHaveBeenCalled()
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

    it('should buffer message when reply_only_in_thread and message is in thread', async () => {
      const { MessageBufferService } = await import('../../src/service/MessageBufferService')
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

      // Message should be buffered
      const MockedBufferService = MessageBufferService as unknown as ReturnType<typeof vi.fn>
      const bufferInstance = MockedBufferService.mock.results[0]?.value
      expect(bufferInstance?.bufferMessage).toHaveBeenCalled()
      expect(responseApi).not.toHaveBeenCalled()
      expect(dispatchResponsesSequentially).not.toHaveBeenCalled()
    })
  })
})
