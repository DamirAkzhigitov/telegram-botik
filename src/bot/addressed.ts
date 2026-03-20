import type { Context } from 'telegraf'
import type { Message, User } from 'telegraf/types'
import OpenAI from 'openai'
import type { SessionData } from '../types'
import { plainTextFromHistoryMessage } from './memoryObserver'

/** Cheap model for addressed-or-not classification in groups. */
export const ADDRESS_CLASSIFIER_MODEL = 'gpt-4.1-mini'

function getMessagePlainText(message: Message): string {
  if ('text' in message && typeof message.text === 'string') {
    return message.text
  }
  if ('caption' in message && typeof message.caption === 'string') {
    return message.caption
  }
  return ''
}

function getMessageEntities(message: Message) {
  if ('entities' in message && Array.isArray(message.entities)) {
    return message.entities
  }
  if (
    'caption_entities' in message &&
    Array.isArray(message.caption_entities)
  ) {
    return message.caption_entities
  }
  return []
}

function sliceEntityText(text: string, offset: number, length: number): string {
  const start = offset
  const end = offset + length
  if (start < 0 || end > text.length) return ''
  return text.slice(start, end)
}

export function hasLeadingBotCommand(message: Message): boolean {
  const text = getMessagePlainText(message)
  if (!text.startsWith('/')) return false
  const entities = getMessageEntities(message)
  const first = entities[0]
  return Boolean(
    first &&
      first.type === 'bot_command' &&
      'offset' in first &&
      first.offset === 0
  )
}

export function hasMentionOfBotUsername(
  message: Message,
  botUsername: string | undefined
): boolean {
  if (!botUsername) return false
  const text = getMessagePlainText(message)
  const uname = botUsername.replace(/^@/, '').toLowerCase()
  const entities = getMessageEntities(message)
  for (const e of entities) {
    if (e.type === 'mention') {
      const frag = sliceEntityText(text, e.offset, e.length).replace(/^@/, '')
      if (frag.toLowerCase() === uname) return true
    }
  }
  return false
}

export function hasTextMentionOfBot(
  message: Message,
  botUserId: number | undefined
): boolean {
  if (botUserId === undefined) return false
  const entities = getMessageEntities(message)
  for (const e of entities) {
    if (e.type === 'text_mention' && 'user' in e && e.user?.id === botUserId) {
      return true
    }
  }
  return false
}

export function isReplyToThisBot(
  message: Message,
  botUserId: number | undefined
): boolean {
  if (botUserId === undefined) return false
  if (!('reply_to_message' in message) || !message.reply_to_message) {
    return false
  }
  const reply = message.reply_to_message
  const from = 'from' in reply ? reply.from : undefined
  return Boolean(from?.is_bot && from.id === botUserId)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function plainTextReferencesBot(
  fullText: string,
  me: Pick<User, 'first_name' | 'username'>
): boolean {
  const lower = fullText.toLowerCase()
  if (me.username) {
    const u = me.username.replace(/^@/, '').toLowerCase()
    if (u && lower.includes(`@${u}`)) return true
    if (u.length >= 3) {
      const re = new RegExp(
        `(^|[^a-z0-9_])${escapeRegExp(u)}([^a-z0-9_]|$)`,
        'i'
      )
      if (re.test(fullText)) return true
    }
  }
  if (me.first_name) {
    const n = me.first_name.trim()
    if (n.length >= 2 && lower.includes(n.toLowerCase())) return true
  }
  return false
}

/**
 * Hard "addressed" signals that skip the small LLM (groups / supergroups only).
 */
export function hasHardAddressedSignal(message: Message, me: User): boolean {
  if (hasLeadingBotCommand(message)) return true
  if (hasMentionOfBotUsername(message, me.username)) return true
  if (hasTextMentionOfBot(message, me.id)) return true
  if (isReplyToThisBot(message, me.id)) return true
  const raw = getMessagePlainText(message)
  if (plainTextReferencesBot(raw, me)) return true
  return false
}

export async function getBotUser(ctx: Context): Promise<User> {
  if (ctx.botInfo) return ctx.botInfo as User
  return ctx.telegram.getMe()
}

/** How many prior user lines from KV history feed the classifier (pronoun / thread disambiguation). */
const MAX_CLASSIFIER_PRIOR_LINES = 16
/** Total character budget for the numbered "Recent lines" block sent to the model. */
const MAX_CLASSIFIER_PRIOR_CHARS = 12_000
/** Max characters of the triggering message included after "Latest message to classify". */
const MAX_CLASSIFIER_LATEST_CHARS = 12_000

export interface AddressedClassifierRecentOpts {
  /** When `scopeToForumThread` is true, only lines with this `[forum_thread_id=…]` prefix are included. */
  currentThreadId?: number
  /** Forum topic + numeric `message_thread_id` on the trigger (matches stored history prefix). */
  scopeToForumThread?: boolean
}

/**
 * Prior user lines from persisted history (the current Telegram message is not in KV yet).
 * Used so the small model can resolve pronouns / continuation (e.g. human→human thread).
 */
export function buildAddressedClassifierRecentContext(
  messages: SessionData['userMessages'],
  opts: AddressedClassifierRecentOpts = {}
): string | undefined {
  const { currentThreadId, scopeToForumThread } = opts
  const collected: string[] = []

  for (let i = messages.length - 1; i >= 0; i--) {
    if (collected.length >= MAX_CLASSIFIER_PRIOR_LINES) break
    const m = messages[i]
    if (m.role !== 'user') continue
    let text = plainTextFromHistoryMessage(m).trim()
    if (!text) continue

    if (scopeToForumThread && typeof currentThreadId === 'number') {
      const prefix = `[forum_thread_id=${currentThreadId}]\n`
      if (!text.startsWith(prefix)) continue
      text = text.slice(prefix.length).trim()
    }

    collected.unshift(text)
  }

  if (collected.length === 0) return undefined

  const numbered = collected.map((line, idx) => `${idx + 1}. ${line}`)
  let block = numbered.join('\n')
  if (block.length > MAX_CLASSIFIER_PRIOR_CHARS) {
    block = block.slice(-MAX_CLASSIFIER_PRIOR_CHARS)
  }
  return block
}

function parseAddressedClassifierJson(raw: string): {
  addressed?: unknown
} | null {
  let s = raw.trim()
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/im.exec(s)
  if (fenced) s = fenced[1].trim()
  try {
    return JSON.parse(s) as { addressed?: unknown }
  } catch {
    return null
  }
}

export async function classifyWhetherAddressed(
  openai: OpenAI,
  params: {
    userText: string
    botUsername?: string
    botFirstName?: string
    /** Older→newer tail of stored user lines (same topic when forum-scoped). */
    recentTranscript?: string
  }
): Promise<boolean | null> {
  const { userText, botUsername, botFirstName, recentTranscript } = params
  const who = [
    botFirstName,
    botUsername ? `@${botUsername.replace(/^@/, '')}` : ''
  ]
    .filter(Boolean)
    .join(' / ')

  const prior = recentTranscript?.trim()
  const userPayload =
    `Bot identity: ${who || 'unknown'}\n` +
    (prior
      ? `Recent lines in this chat/topic (older first; excludes the line you are classifying):\n${prior}\n\n`
      : '') +
    `Latest message to classify:\n${userText.slice(0, MAX_CLASSIFIER_LATEST_CHARS)}`

  try {
    const completion = await openai.chat.completions.create(
      {
        model: ADDRESS_CLASSIFIER_MODEL,
        temperature: 0,
        max_completion_tokens: 32,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You decide if the LATEST group chat line is meant for the bot to answer (user wants the bot to respond) versus background chat between humans. ' +
              'Use Recent lines when present: pronouns (you/ты/тебе/тобой) or short follow-ups often refer to the person addressed there, not the bot. ' +
              'If the latest line clearly continues a human-to-human thread (e.g. a name in recent lines, then "play with you" without @bot or bot name), output {"addressed":false}. ' +
              'Reply with JSON only: {"addressed":true} or {"addressed":false}. ' +
              'If unsure, prefer false.'
          },
          {
            role: 'user',
            content: userPayload
          }
        ]
      },
      { timeout: 30_000 }
    )

    const raw = completion.choices[0]?.message?.content
    if (!raw) return null
    const parsed = parseAddressedClassifierJson(raw)
    if (!parsed || typeof parsed.addressed !== 'boolean') return null
    return parsed.addressed
  } catch (e) {
    console.error('classifyWhetherAddressed', e)
    return null
  }
}

/**
 * Directed-reply mode for non-private chats: heuristics first, else classifier.
 * Classifier failure → reply (fail-open) so API hiccups do not mute the bot.
 */
export async function resolveShouldReplyDirected(
  ctx: Context,
  openai: OpenAI,
  options?: { recentTranscript?: string }
): Promise<boolean> {
  const chat = ctx.chat
  if (!chat) return false
  if (chat.type === 'private') return true

  const message = ctx.message
  if (!message) return false

  const me = await getBotUser(ctx)
  if (hasHardAddressedSignal(message, me)) return true

  const userText = getMessagePlainText(message)
  const classified = await classifyWhetherAddressed(openai, {
    userText: userText || '(no text)',
    botUsername: me.username,
    botFirstName: me.first_name,
    recentTranscript: options?.recentTranscript
  })
  if (classified === null) {
    console.warn(
      'resolveShouldReplyDirected: classifier unavailable or unparseable; replying anyway'
    )
    return true
  }
  return classified
}
