/**
 * End-to-end style: POST a Telegram update through the worker → real Telegraf →
 * real message pipeline. OpenAI / D1 / KV are faked; Telegram HTTP goes to a local stub
 * (see TELEGRAM_API_ROOT + TELEGRAM_BOT_INFO_JSON in createBot).
 */
import http from 'node:http'
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import type { SessionData } from '../../src/types'

const hoisted = vi.hoisted(() => {
  const responseApi = vi.fn()
  const getOpenAIClient = vi.fn(() => ({
    responseApi,
    openai: {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: '{"addressed":true}' } }]
          })
        }
      }
    }
  }))
  return { responseApi, getOpenAIClient }
})

vi.mock('../../src/gpt', () => ({
  getOpenAIClient: hoisted.getOpenAIClient
}))

vi.mock('../../src/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils')>()
  return { ...actual, delay: vi.fn().mockResolvedValue(undefined) }
})

vi.mock('../../src/service/EmbeddingService', () => ({
  EmbeddingService: vi.fn().mockImplementation(() => ({
    fetchRelevantSummaries: vi.fn().mockResolvedValue([]),
    fetchRelevantMessages: vi.fn().mockResolvedValue([]),
    saveMessage: vi.fn().mockResolvedValue(undefined),
    saveSummary: vi.fn().mockResolvedValue(undefined)
  }))
}))

import worker from '../../src/index'

const CHAT_ID = 777
const USER_ID = 42

const E2E_BOT_ME = {
  id: 888001,
  is_bot: true,
  first_name: 'E2EBot',
  username: 'e2e_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false
}

function createSeededSession(): SessionData {
  return {
    userMessages: [],
    stickersPacks: ['koshachiy_raskolbas'],
    prompt: 'e2e prompt',
    firstTime: false,
    promptNotSet: false,
    stickerNotSet: false,
    model: 'gpt-4.1-mini',
    toggle_history: false,
    memories: [],
    chat_settings: {
      reply_only_in_thread: false,
      directed_reply_gating: false,
      send_message_option: {},
      proactive_enabled: false
    },
    thread_activity: {},
    proactive_pending: {}
  }
}

function createMemoryKv(initial: Map<string, string>) {
  return {
    get: async (key: string) => initial.get(key) ?? null,
    put: async (key: string, value: string) => {
      initial.set(key, value)
    }
  }
}

function createUserDbMock() {
  const mockUser = {
    id: 1,
    telegram_id: USER_ID,
    username: 'e2e_user',
    first_name: 'E2E',
    last_name: 'User',
    coins: 10,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  }
  const mockDb = {
    prepare: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE telegram_id')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(mockUser)
        }
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({}),
        first: vi.fn().mockResolvedValue(null)
      }
    })
  }
  return mockDb
}

function startTelegramApiStub(): Promise<{
  origin: string
  close: () => Promise<void>
  getSendMessageBodies: () => string[]
}> {
  const sendMessageBodies: string[] = []
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c as Buffer))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      res.setHeader('Content-Type', 'application/json')
      if (req.url?.includes('/getMe')) {
        res.end(
          JSON.stringify({
            ok: true,
            result: E2E_BOT_ME
          })
        )
        return
      }
      if (req.url?.includes('/sendMessage') && raw) {
        sendMessageBodies.push(raw)
        try {
          const payload = JSON.parse(raw) as Record<string, unknown>
          res.end(
            JSON.stringify({
              ok: true,
              result: {
                message_id: 42,
                date: 0,
                chat: { id: payload.chat_id, type: 'private' },
                text: payload.text
              }
            })
          )
        } catch {
          res.statusCode = 500
          res.end(JSON.stringify({ ok: false }))
        }
        return
      }
      res.end(JSON.stringify({ ok: true, result: true }))
    })
  })

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('stub listen failed'))
        return
      }
      resolve({
        origin: `http://127.0.0.1:${addr.port}/`,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()))
          }),
        getSendMessageBodies: () => sendMessageBodies
      })
    })
  })
}

describe('e2e: webhook → bot reply', () => {
  let stub: Awaited<ReturnType<typeof startTelegramApiStub>>
  let kv: Map<string, string>
  let env: Env

  beforeAll(async () => {
    stub = await startTelegramApiStub()
  })

  afterAll(async () => {
    await stub.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    stub.getSendMessageBodies().length = 0
    kv = new Map([[`session_${CHAT_ID}`, JSON.stringify(createSeededSession())]])
    env = {
      API_KEY: 'test-openai-key',
      BOT_TOKEN: '123456:ABC-DEF_fake_token_for_tests',
      PINECONE: 'test-pinecone-key',
      DB: createUserDbMock() as unknown as D1Database,
      CHAT_SESSIONS_STORAGE: createMemoryKv(kv) as unknown as KVNamespace,
      TELEGRAM_API_ROOT: stub.origin,
      TELEGRAM_BOT_INFO_JSON: JSON.stringify(E2E_BOT_ME)
    } as Env

    hoisted.responseApi.mockResolvedValue([
      { type: 'text', content: 'e2e bot reply line' }
    ])
  })

  it('POST update runs pipeline and sends Telegram sendMessage with model text', async () => {
    const update = {
      update_id: 9001,
      message: {
        message_id: 100,
        date: Math.floor(Date.now() / 1000),
        chat: { id: CHAT_ID, type: 'private' as const },
        from: {
          id: USER_ID,
          is_bot: false,
          first_name: 'E2E',
          username: 'e2e_user'
        },
        text: 'hello from e2e'
      }
    }

    const request = new Request('https://worker.example/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    })

    const response = await worker.fetch(request, env)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('OK')
    expect(hoisted.getOpenAIClient).toHaveBeenCalledWith('test-openai-key')
    expect(hoisted.responseApi).toHaveBeenCalled()

    const bodies = stub.getSendMessageBodies()
    const hit = bodies.find((b) => b.includes('e2e bot reply line'))
    expect(hit).toBeDefined()
    expect(hit).toContain(String(CHAT_ID))
  })
})
