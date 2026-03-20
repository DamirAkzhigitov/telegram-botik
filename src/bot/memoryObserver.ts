import OpenAI from 'openai'
import type { SessionData } from '../types'

/** Same tier as addressed classifier — cheap background extraction. */
export const MEMORY_OBSERVER_MODEL = 'gpt-4.1-mini'

const MAX_HISTORY_CHARS = 2800
const MAX_MEMORIES = 4
const MAX_MEMORY_ITEM_CHARS = 400

export function plainTextFromHistoryMessage(
  message: SessionData['userMessages'][number]
): string {
  if (message.role === 'user') {
    return message.content
      .filter((c) => c.type === 'input_text')
      .map((c) => c.text)
      .join(' ')
      .trim()
  }
  if (message.role === 'assistant') {
    return message.content
      .filter((c) => c.type === 'output_text')
      .map((c) => c.text)
      .join(' ')
      .trim()
  }
  return ''
}

/** Compact tail of transcript for observer context (user/assistant text only). */
export function formatRecentHistoryForObserver(
  messages: SessionData['userMessages'],
  maxChars = MAX_HISTORY_CHARS
): string {
  const lines: string[] = []
  let used = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    const text = plainTextFromHistoryMessage(m)
    if (!text.length) continue
    const label = m.role === 'user' ? 'U' : 'A'
    const line = `${label}: ${text}`
    if (used + line.length + 1 > maxChars) break
    lines.unshift(line)
    used += line.length + 1
  }
  return lines.join('\n')
}

function normalizeMemoryList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const t = item.trim()
    if (t.length === 0) continue
    out.push(t.slice(0, MAX_MEMORY_ITEM_CHARS))
    if (out.length >= MAX_MEMORIES) break
  }
  return out
}

export interface BackgroundMemoryParams {
  latestUserLine: string
  recentTranscript: string
  /** Last few stored memories (content only) to reduce duplicates. */
  existingMemorySnippets: string[]
}

/**
 * Stage 1b / §6#9: extract memories when the bot does not send a user-visible reply.
 * Failures → empty list (no throw).
 */
export async function extractBackgroundMemories(
  openai: OpenAI,
  params: BackgroundMemoryParams
): Promise<string[]> {
  const { latestUserLine, recentTranscript, existingMemorySnippets } = params
  const trimmed = latestUserLine.trim()
  if (trimmed.length === 0) return []

  const existingBlock =
    existingMemorySnippets.length > 0
      ? `Already stored (do not repeat):\n${existingMemorySnippets.map((s) => `- ${s.slice(0, 200)}`).join('\n')}\n\n`
      : ''

  try {
    const completion = await openai.chat.completions.create(
      {
        model: MEMORY_OBSERVER_MODEL,
        temperature: 0,
        max_completion_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You extract durable facts for a chat bot long-term memory. The bot is NOT replying to this message (background group chat). ' +
              'Return JSON only: {"memories": string[]} — each string one short fact (names, preferences, relationships, plans, notable events). ' +
              'Skip transient chat, jokes with no lasting info, or duplicates of existing_memory. ' +
              'Use the same language as the source when natural. If nothing qualifies, return {"memories":[]}.'
          },
          {
            role: 'user',
            content:
              `${existingBlock}Recent transcript (may be truncated):\n${recentTranscript || '(empty)'}\n\n` +
              `Latest line to focus on:\n${trimmed.slice(0, 2000)}`
          }
        ]
      },
      { timeout: 14_000 }
    )

    const raw = completion.choices[0]?.message?.content
    if (!raw) return []
    const parsed = JSON.parse(raw) as { memories?: unknown }
    return normalizeMemoryList(parsed.memories)
  } catch (e) {
    console.error('extractBackgroundMemories', e)
    return []
  }
}
