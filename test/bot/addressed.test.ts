import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Message } from 'telegraf/types'
import type { User } from 'telegraf/types'
import {
  hasLeadingBotCommand,
  hasMentionOfBotUsername,
  hasTextMentionOfBot,
  isReplyToThisBot,
  plainTextReferencesBot,
  hasHardAddressedSignal,
  classifyWhetherAddressed,
  buildAddressedClassifierRecentContext,
  ADDRESS_CLASSIFIER_MODEL
} from '../../src/bot/addressed'
import type { SessionData } from '../../src/types'

const botUser: User = {
  id: 99,
  is_bot: true,
  first_name: 'TestBot',
  username: 'mytestbot'
}

describe('addressed heuristics', () => {
  it('detects leading bot_command entity', () => {
    const msg = {
      text: '/start hello',
      entities: [{ type: 'bot_command' as const, offset: 0, length: 6 }]
    } as Message
    expect(hasLeadingBotCommand(msg)).toBe(true)
  })

  it('ignores bot_command not at offset 0', () => {
    const msg = {
      text: 'hi /start',
      entities: [{ type: 'bot_command' as const, offset: 3, length: 6 }]
    } as Message
    expect(hasLeadingBotCommand(msg)).toBe(false)
  })

  it('detects @username mention entity', () => {
    const msg = {
      text: 'yo @mytestbot there',
      entities: [{ type: 'mention' as const, offset: 3, length: 10 }]
    } as Message
    expect(hasMentionOfBotUsername(msg, 'mytestbot')).toBe(true)
  })

  it('detects text_mention of bot id', () => {
    const msg = {
      text: 'hey there',
      entities: [
        {
          type: 'text_mention' as const,
          offset: 0,
          length: 3,
          user: { id: 99, is_bot: false, first_name: 'U' }
        }
      ]
    } as Message
    expect(hasTextMentionOfBot(msg, 99)).toBe(true)
  })

  it('detects reply to this bot', () => {
    const msg = {
      text: 'reply',
      reply_to_message: {
        message_id: 1,
        date: 0,
        chat: { id: 1, type: 'supergroup' },
        from: { id: 99, is_bot: true, first_name: 'B' }
      }
    } as Message
    expect(isReplyToThisBot(msg, 99)).toBe(true)
    expect(isReplyToThisBot(msg, 100)).toBe(false)
  })

  it('plainTextReferencesBot matches @username and first_name', () => {
    expect(plainTextReferencesBot('call @mytestbot now', botUser)).toBe(true)
    expect(plainTextReferencesBot('TestBot привет', botUser)).toBe(true)
    expect(plainTextReferencesBot('random human chat', botUser)).toBe(false)
  })

  it('hasHardAddressedSignal combines signals', () => {
    const mentionMsg = {
      text: '@mytestbot hi',
      entities: [{ type: 'mention' as const, offset: 0, length: 10 }]
    } as Message
    expect(hasHardAddressedSignal(mentionMsg, botUser)).toBe(true)
  })
})

describe('buildAddressedClassifierRecentContext', () => {
  const userLine = (text: string): SessionData['userMessages'][number] => ({
    role: 'user',
    content: [{ type: 'input_text', text }]
  })

  it('returns undefined when history is empty', () => {
    expect(buildAddressedClassifierRecentContext([])).toBeUndefined()
  })

  it('includes last user lines in order when not forum-scoped', () => {
    const messages: SessionData['userMessages'] = [
      userLine('a: first'),
      userLine('b: second'),
      userLine('c: third')
    ]
    const ctx = buildAddressedClassifierRecentContext(messages)
    expect(ctx).toContain('1. a: first')
    expect(ctx).toContain('2. b: second')
    expect(ctx).toContain('3. c: third')
  })

  it('filters by forum thread prefix when scopeToForumThread', () => {
    const messages: SessionData['userMessages'] = [
      userLine('[forum_thread_id=1]\nx: in topic 1'),
      userLine('[forum_thread_id=2]\ny: in topic 2')
    ]
    const t2 = buildAddressedClassifierRecentContext(messages, {
      currentThreadId: 2,
      scopeToForumThread: true
    })
    expect(t2).toContain('y: in topic 2')
    expect(t2).not.toContain('topic 1')
  })
})

describe('classifyWhetherAddressed', () => {
  let create: ReturnType<typeof vi.fn>

  beforeEach(() => {
    create = vi.fn()
  })

  it('returns boolean from JSON content', async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: '{"addressed":true}' } }]
    })
    const openai = { chat: { completions: { create } } } as any
    const r = await classifyWhetherAddressed(openai, { userText: 'hey bot' })
    expect(r).toBe(true)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: ADDRESS_CLASSIFIER_MODEL,
        response_format: { type: 'json_object' }
      }),
      expect.anything()
    )
  })

  it('passes recentTranscript into the user message', async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: '{"addressed":false}' } }]
    })
    const openai = { chat: { completions: { create } } } as any
    await classifyWhetherAddressed(openai, {
      userText: 'я вот думал поиграть с тобой',
      recentTranscript: '1. Лех ну что ты там работаешь?'
    })
    const payload = create.mock.calls[0][0].messages[1].content as string
    expect(payload).toContain('Recent lines')
    expect(payload).toContain('Лех')
    expect(payload).toContain('Latest message to classify')
  })

  it('returns null on invalid JSON shape', async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: '{"addressed":"yes"}' } }]
    })
    const openai = { chat: { completions: { create } } } as any
    expect(await classifyWhetherAddressed(openai, { userText: 'x' })).toBe(null)
  })

  it('parses JSON inside markdown fence', async () => {
    create.mockResolvedValue({
      choices: [
        {
          message: {
            content: '```json\n{"addressed": false}\n```'
          }
        }
      ]
    })
    const openai = { chat: { completions: { create } } } as any
    expect(await classifyWhetherAddressed(openai, { userText: 'x' })).toBe(false)
  })

  it('returns null on API error', async () => {
    create.mockRejectedValue(new Error('network'))
    const openai = { chat: { completions: { create } } } as any
    expect(await classifyWhetherAddressed(openai, { userText: 'x' })).toBe(null)
  })
})
