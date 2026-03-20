import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionData } from '../../src/types'
import {
  parseChatIdFromSessionKey,
  proactiveStaleThresholdMs,
  isThreadStale,
  listRevivalCandidateThreadKeys,
  buildRevivalTranscript,
  classifyThreadRevival,
  generateRevivalMessageSmall,
  runProactiveCronTick
} from '../../src/cron/proactiveRevival'
import { THREAD_ACTIVITY_DEFAULT_KEY } from '../../src/bot/threadActivity'
import OpenAI from 'openai'

function baseSession(over: Partial<SessionData> = {}): SessionData {
  return {
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
      proactive_enabled: true,
      send_message_option: {}
    },
    thread_activity: {},
    proactive_pending: {},
    ...over
  }
}

describe('proactiveRevival helpers', () => {
  it('parseChatIdFromSessionKey', () => {
    expect(parseChatIdFromSessionKey('session_-100123')).toBe('-100123')
    expect(parseChatIdFromSessionKey('other')).toBeNull()
  })

  it('proactiveStaleThresholdMs uses default 48h', () => {
    const s = baseSession()
    expect(proactiveStaleThresholdMs(s)).toBe(48 * 3600 * 1000)
  })

  it('proactiveStaleThresholdMs respects chat_settings', () => {
    const s = baseSession({
      chat_settings: { ...baseSession().chat_settings, proactive_stale_hours: 24 }
    })
    expect(proactiveStaleThresholdMs(s)).toBe(24 * 3600 * 1000)
  })

  it('isThreadStale', () => {
    const now = Date.parse('2025-06-10T12:00:00.000Z')
    const threshold = 3600 * 1000
    expect(
      isThreadStale(
        { lastActivityAt: '2025-06-10T10:00:00.000Z' },
        now,
        threshold
      )
    ).toBe(true)
    expect(
      isThreadStale(
        { lastActivityAt: '2025-06-10T11:30:00.000Z' },
        now,
        threshold
      )
    ).toBe(false)
  })

  it('listRevivalCandidateThreadKeys respects enabled, history, pending, staleness', () => {
    const now = Date.parse('2025-06-10T12:00:00.000Z')
    const staleAt = '2025-06-01T10:00:00.000Z'

    expect(
      listRevivalCandidateThreadKeys(
        baseSession({ chat_settings: { proactive_enabled: false } }),
        now
      )
    ).toEqual([])

    expect(
      listRevivalCandidateThreadKeys(
        baseSession({ toggle_history: false, thread_activity: { __default: { lastActivityAt: staleAt } } }),
        now
      )
    ).toEqual([])

    expect(
      listRevivalCandidateThreadKeys(
        baseSession({
          thread_activity: { __default: { lastActivityAt: staleAt } },
          proactive_pending: { __default: { sentAt: '2025-06-09T00:00:00.000Z' } }
        }),
        now
      )
    ).toEqual([])

    expect(
      listRevivalCandidateThreadKeys(
        baseSession({
          thread_activity: { __default: { lastActivityAt: staleAt } }
        }),
        now
      )
    ).toEqual([THREAD_ACTIVITY_DEFAULT_KEY])
  })

  it('listRevivalCandidateThreadKeys sorts __default after numeric keys', () => {
    const now = Date.parse('2025-06-10T12:00:00.000Z')
    const staleAt = '2025-06-01T10:00:00.000Z'
    const keys = listRevivalCandidateThreadKeys(
      baseSession({
        thread_activity: {
          __default: { lastActivityAt: staleAt },
          '2': { lastActivityAt: staleAt },
          '10': { lastActivityAt: staleAt }
        }
      }),
      now
    )
    expect(keys).toEqual(['2', '10', '__default'])
  })

  it('buildRevivalTranscript uses observer for default bucket', () => {
    const session = baseSession({
      userMessages: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'alice: hi' }]
        } as any
      ]
    })
    const t = buildRevivalTranscript(session.userMessages, THREAD_ACTIVITY_DEFAULT_KEY, 500)
    expect(t).toContain('alice: hi')
  })

  it('buildRevivalTranscript filters forum thread prefix', () => {
    const session = baseSession({
      userMessages: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: '[forum_thread_id=5]\nalice: in topic' }
          ]
        } as any,
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'bob: other topic' }]
        } as any
      ]
    })
    const t = buildRevivalTranscript(session.userMessages, '5', 500)
    expect(t).toContain('in topic')
    expect(t).not.toContain('other topic')
  })
})

describe('proactiveRevival LLM stubs', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('classifyThreadRevival parses revive', async () => {
    const openai = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: '{"revive":true}' } }]
          })
        }
      }
    } as unknown as OpenAI
    expect(await classifyThreadRevival(openai, 'some text')).toBe(true)
  })

  it('generateRevivalMessageSmall parses text', async () => {
    const openai = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: '{"text":"привет всем"}' } }]
          })
        }
      }
    } as unknown as OpenAI
    expect(await generateRevivalMessageSmall(openai, 'ctx')).toBe('привет всем')
  })
})

describe('runProactiveCronTick', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('no-ops without BOT_TOKEN or API_KEY', async () => {
    await runProactiveCronTick({} as Env)
  })
})
