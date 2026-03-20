import OpenAI from 'openai'
import { EmbeddingService } from '../service/EmbeddingService'
import { SessionController } from '../service/SessionController'
import type { ChatSettings, MessagesArray, SessionData } from '../types'
import {
  buildAssistantHistoryMessages,
  persistConversationHistory,
  sanitizeHistoryMessages
} from '../bot/history'
import {
  createUserMessage,
  extractMemoryItems,
  filterResponseMessages
} from '../bot/messageBuilder'
import {
  formatRecentHistoryForObserver,
  plainTextFromHistoryMessage
} from '../bot/memoryObserver'
import { THREAD_ACTIVITY_DEFAULT_KEY } from '../bot/threadActivity'
import {
  formatPersonaMoodMemoryLine,
  personaMoodChanged,
  resolveMoodForInjection,
  resolvePersonaMoodForInjection,
  updateMoodAfterAddressedTurn
} from '../bot/mood'
import { getOpenAIClient } from '../gpt'

/** KV cursor for paginated `session_*` scans across cron ticks. */
export const PROACTIVE_LIST_CURSOR_KEY = 'cron_proactive_list_cursor'

export const PROACTIVE_REVIVAL_MODEL = 'gpt-4.1-mini'

const LIST_PAGE_LIMIT = 100
const MAX_CHATS_SCANNED_PER_TICK = 60
const MAX_SENDS_PER_TICK = 10
const MIN_SMALL_REPLY_CHARS = 8
const TELEGRAM_TEXT_LIMIT = 4096

export function parseChatIdFromSessionKey(name: string): string | null {
  if (!name.startsWith('session_')) return null
  return name.slice('session_'.length) || null
}

export function proactiveStaleThresholdMs(session: SessionData): number {
  const h = session.chat_settings.proactive_stale_hours
  const hours = typeof h === 'number' && Number.isFinite(h) && h > 0 ? h : 48
  return hours * 3600 * 1000
}

export function isThreadStale(
  bucket: { lastActivityAt?: string } | undefined,
  nowMs: number,
  thresholdMs: number
): boolean {
  if (!bucket?.lastActivityAt) return false
  const t = Date.parse(bucket.lastActivityAt)
  if (Number.isNaN(t)) return false
  return nowMs - t >= thresholdMs
}

/**
 * Thread keys eligible for revival: had activity, stale, no pending proactive reply.
 */
export function listRevivalCandidateThreadKeys(
  session: SessionData,
  nowMs: number
): string[] {
  if (!session.chat_settings.proactive_enabled) return []
  if (!session.toggle_history) return []

  const threshold = proactiveStaleThresholdMs(session)
  const activity = session.thread_activity ?? {}
  const pending = session.proactive_pending ?? {}

  const keys = Object.keys(activity).filter((key) => {
    if (pending[key]) return false
    return isThreadStale(activity[key], nowMs, threshold)
  })

  keys.sort((a, b) => {
    if (a === THREAD_ACTIVITY_DEFAULT_KEY) return 1
    if (b === THREAD_ACTIVITY_DEFAULT_KEY) return -1
    return a.localeCompare(b, undefined, { numeric: true })
  })
  return keys
}

/** Transcript tail for LLM; forum topics filter user lines by `[forum_thread_id=]`. */
export function buildRevivalTranscript(
  messages: SessionData['userMessages'],
  threadKey: string,
  maxChars = 3200
): string {
  if (threadKey === THREAD_ACTIVITY_DEFAULT_KEY) {
    return formatRecentHistoryForObserver(messages, maxChars)
  }

  const prefix = `[forum_thread_id=${threadKey}]`
  const lines: string[] = []
  let used = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    const raw = plainTextFromHistoryMessage(m)
    if (!raw) continue

    if (m.role === 'user') {
      if (!raw.startsWith(prefix)) continue
      const stripped = raw.slice(prefix.length).replace(/^\n/, '')
      const line = `U: ${stripped}`
      if (used + line.length + 1 > maxChars) break
      lines.unshift(line)
      used += line.length + 1
    } else {
      const line = `A: ${raw}`
      if (used + line.length + 1 > maxChars) break
      lines.unshift(line)
      used += line.length + 1
    }
  }

  if (lines.length > 0) {
    return lines.join('\n').slice(-maxChars)
  }

  return formatRecentHistoryForObserver(messages, maxChars)
}

export async function classifyThreadRevival(
  openai: OpenAI,
  transcript: string
): Promise<boolean> {
  const trimmed = transcript.trim()
  if (trimmed.length < 3) return false

  try {
    const completion = await openai.chat.completions.create(
      {
        model: PROACTIVE_REVIVAL_MODEL,
        temperature: 0,
        max_completion_tokens: 120,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You decide if a stalled chat thread should get a single casual revival message from a participant bot. ' +
              'Return JSON only: {"revive":boolean}. Use revive=false when the last lines are clearly two humans talking to each other, a private side conversation, the bot was told to stop, or the topic is clearly closed. ' +
              'Use revive=true when a light nudge fits the group vibe.'
          },
          {
            role: 'user',
            content: `Recent transcript:\n${trimmed.slice(0, 3800)}`
          }
        ]
      },
      { timeout: 14_000 }
    )

    const raw = completion.choices[0]?.message?.content
    if (!raw) return false
    const parsed = JSON.parse(raw) as { revive?: unknown }
    return parsed.revive === true
  } catch (e) {
    console.error('classifyThreadRevival', e)
    return false
  }
}

export async function generateRevivalMessageSmall(
  openai: OpenAI,
  transcript: string
): Promise<string> {
  try {
    const completion = await openai.chat.completions.create(
      {
        model: PROACTIVE_REVIVAL_MODEL,
        temperature: 0.65,
        max_completion_tokens: 220,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Write one short casual chat line in Russian to revive a quiet thread. Persona: Ivan (same as main bot — informal ты, lowercase sentences, no trailing period). ' +
              'JSON only: {"text":"..."} — max 380 characters, no meta, no "я бот".'
          },
          {
            role: 'user',
            content: `Context:\n${transcript.trim().slice(0, 3800)}`
          }
        ]
      },
      { timeout: 16_000 }
    )

    const raw = completion.choices[0]?.message?.content
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { text?: unknown }
    return typeof parsed.text === 'string' ? parsed.text.trim() : ''
  } catch (e) {
    console.error('generateRevivalMessageSmall', e)
    return ''
  }
}

async function telegramSendMessage(
  botToken: string,
  params: {
    chat_id: string | number
    text: string
    message_thread_id?: number
  }
): Promise<{ ok: boolean; description?: string }> {
  const body: Record<string, unknown> = {
    chat_id: params.chat_id,
    text: params.text.slice(0, TELEGRAM_TEXT_LIMIT)
  }
  if (params.message_thread_id !== undefined) {
    body.message_thread_id = params.message_thread_id
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    )
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      description?: string
    }
    return { ok: Boolean(data.ok), description: data.description }
  } catch (e) {
    console.error('telegramSendMessage', e)
    return { ok: false, description: 'fetch failed' }
  }
}

function revivalThreadPrefix(threadKey: string): string {
  if (threadKey === THREAD_ACTIVITY_DEFAULT_KEY) return ''
  if (/^\d+$/.test(threadKey)) {
    return `[forum_thread_id=${threadKey}]\n`
  }
  return ''
}

function threadKeyToSendThreadId(
  threadKey: string,
  isForumSupergroup: boolean | undefined
): number | undefined {
  if (!isForumSupergroup) return undefined
  if (threadKey === THREAD_ACTIVITY_DEFAULT_KEY) return undefined
  const n = Number(threadKey)
  return Number.isFinite(n) ? n : undefined
}

function messagesArrayFromText(text: string): MessagesArray {
  return [{ type: 'text', content: text }]
}

/**
 * Stage 3 cron tick: scan one KV list page, attempt bounded proactive sends.
 */
export async function runProactiveCronTick(env: Env): Promise<void> {
  if (!env.BOT_TOKEN || !env.API_KEY) {
    console.warn('runProactiveCronTick: missing BOT_TOKEN or API_KEY')
    return
  }

  const { responseApi, openai } = getOpenAIClient(env.API_KEY)
  const sessionController = new SessionController(env)
  const embeddingService = new EmbeddingService(env)

  const savedCursor = await env.CHAT_SESSIONS_STORAGE.get(
    PROACTIVE_LIST_CURSOR_KEY
  )
  const listResult = await env.CHAT_SESSIONS_STORAGE.list({
    prefix: 'session_',
    limit: LIST_PAGE_LIMIT,
    cursor: savedCursor || undefined
  })

  if (!listResult.list_complete && listResult.cursor) {
    await env.CHAT_SESSIONS_STORAGE.put(
      PROACTIVE_LIST_CURSOR_KEY,
      listResult.cursor
    )
  } else {
    await env.CHAT_SESSIONS_STORAGE.delete(PROACTIVE_LIST_CURSOR_KEY)
  }

  const nowMs = Date.now()
  let sendsThisTick = 0
  let scanned = 0

  for (const key of listResult.keys) {
    if (scanned >= MAX_CHATS_SCANNED_PER_TICK) break
    if (sendsThisTick >= MAX_SENDS_PER_TICK) break

    const chatId = parseChatIdFromSessionKey(key.name)
    if (!chatId) continue

    scanned++

    const session = await sessionController.getSession(chatId)
    const candidates = listRevivalCandidateThreadKeys(session, nowMs)
    if (candidates.length === 0) continue

    // One thread per chat per tick staggers forum topics and reduces Telegram burst rate.
    const threadKey = candidates[0]

    const transcript = buildRevivalTranscript(
      session.userMessages ?? [],
      threadKey
    )
    const shouldRevive = await classifyThreadRevival(openai, transcript)
    if (!shouldRevive) continue

    const smallText = await generateRevivalMessageSmall(openai, transcript)
    let botMessages: MessagesArray | null = null

    if (smallText.length < MIN_SMALL_REPLY_CHARS) {
      const prefix = revivalThreadPrefix(threadKey)
      const revivalUser = createUserMessage([
        {
          type: 'input_text',
          text: `${prefix}_system: чат затих; одно короткое сообщение на русском, продолжи нить естественно, без мета-комментариев.`
        }
      ])

      botMessages = await responseApi(
        [
          ...sessionController.getFormattedMemories(),
          ...sanitizeHistoryMessages(session.userMessages ?? []),
          revivalUser
        ],
        {
          hasEnoughCoins: true,
          model: session.model,
          prompt: session.prompt,
          moodText: resolveMoodForInjection(session.chat_settings),
          personaMoodText: resolvePersonaMoodForInjection(session.chat_settings)
        }
      )
    } else {
      botMessages = messagesArrayFromText(smallText)
    }

    if (!botMessages?.length) continue

    const memoryItems = extractMemoryItems(botMessages)
    const visible = filterResponseMessages(botMessages)
    const textToSend = visible
      .filter((m) => m.type === 'text')
      .map((m) => m.content)
      .join('\n')
      .trim()
      .slice(0, TELEGRAM_TEXT_LIMIT)

    if (!textToSend) continue

    const sendResult = await telegramSendMessage(env.BOT_TOKEN, {
      chat_id: chatId,
      text: textToSend,
      message_thread_id: threadKeyToSendThreadId(
        threadKey,
        session.is_forum_supergroup
      )
    })

    if (!sendResult.ok) {
      console.error('proactive send failed', chatId, threadKey, sendResult)
      continue
    }

    sendsThisTick++

    for (const mem of memoryItems) {
      await sessionController.addMemory(chatId, mem.content)
    }

    const prefix = revivalThreadPrefix(threadKey)
    const revivalUser = createUserMessage([
      {
        type: 'input_text',
        text: `${prefix}_system: proactive revival (cron)`
      }
    ])

    const historyMessages = sanitizeHistoryMessages(session.userMessages ?? [])
    const persistedMessages = [
      ...historyMessages,
      revivalUser,
      ...buildAssistantHistoryMessages(botMessages)
    ]

    await persistConversationHistory({
      chatId,
      messages: persistedMessages,
      toggleHistory: true,
      sessionController,
      embeddingService,
      openai,
      model: session.model
    })

    await sessionController.setProactivePendingKey(
      chatId,
      threadKey,
      new Date()
    )

    const prevMood = resolveMoodForInjection(session.chat_settings)
    const prevPersona = session.chat_settings.persona_mood
    const { mood: newMood, persona: newPersona } =
      await updateMoodAfterAddressedTurn(openai, {
        userLine: `proactive revival (cron) thread ${threadKey}\n${transcript.slice(-1200)}`,
        assistantVisible: textToSend,
        previousMood: prevMood,
        previousMoodUpdatedAt: session.chat_settings.mood_updated_at,
        previousPersona: prevPersona
      })
    const moodChanged =
      Boolean(newMood) && newMood!.trim() !== (prevMood ?? '').trim()
    const personaChanged =
      Boolean(newPersona) && personaMoodChanged(prevPersona, newPersona)

    if (moodChanged || personaChanged) {
      const chatSettingsPatch: Partial<ChatSettings> = {}
      if (moodChanged && newMood) chatSettingsPatch.mood_text = newMood
      if (personaChanged && newPersona)
        chatSettingsPatch.persona_mood = newPersona
      chatSettingsPatch.mood_updated_at = new Date().toISOString()
      await sessionController.updateSession(chatId, {
        chat_settings: chatSettingsPatch
      })
      if (moodChanged && newMood) {
        await sessionController.addMemory(chatId, `Настроение: ${newMood}`)
      }
      if (personaChanged && newPersona) {
        await sessionController.addMemory(
          chatId,
          formatPersonaMoodMemoryLine(newPersona)
        )
      }
    }
  }
}
