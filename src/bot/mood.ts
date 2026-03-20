import OpenAI from 'openai'
import type { ChatSettings } from '../types'

/** §6: free-text mood minimum length (Russian). */
export const MOOD_MIN_LENGTH = 150

export const MOOD_UPDATE_MODEL = 'gpt-4.1-mini'

const LATIN_LETTER = /[A-Za-z]/

/**
 * Russian-only for model-facing mood: no Latin letters; enough Cyrillic letters.
 */
export function isRussianMoodText(text: string): boolean {
  if (LATIN_LETTER.test(text)) return false
  const cyrillic = (text.match(/[А-Яа-яЁё]/g) ?? []).length
  return cyrillic >= 40
}

export function validateMoodTextForStorage(text: string): string | null {
  const t = text.trim()
  if (t.length < MOOD_MIN_LENGTH) {
    return `mood_text must be at least ${MOOD_MIN_LENGTH} characters`
  }
  if (!isRussianMoodText(t)) {
    return 'mood_text must be Russian (Cyrillic) only, no Latin letters'
  }
  return null
}

/** Mood stored in session: inject into main model only when valid. */
export function resolveMoodForInjection(
  cs: ChatSettings | undefined
): string | undefined {
  const t = cs?.mood_text?.trim()
  if (!t) return undefined
  return validateMoodTextForStorage(t) === null ? t : undefined
}

export function validateChatSettingsPatchPartial(
  cs: Record<string, unknown>
): string | null {
  if (
    'mood_updated_at' in cs &&
    cs.mood_updated_at != null &&
    typeof cs.mood_updated_at !== 'string'
  ) {
    return 'mood_updated_at must be a string or null'
  }
  if (!('mood_text' in cs)) return null
  const v = cs.mood_text
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return 'mood_text must be a string'
  if (v.length === 0) return null
  return validateMoodTextForStorage(v)
}

/**
 * After an addressed full reply (or proactive send), refresh free-text mood.
 * Lazy decay: prompt asks to soften toward neutral when the exchange is calm.
 */
export async function updateMoodAfterAddressedTurn(
  openai: OpenAI,
  params: {
    userLine: string
    assistantVisible: string
    previousMood?: string
    previousMoodUpdatedAt?: string
  }
): Promise<string | null> {
  const { userLine, assistantVisible, previousMood, previousMoodUpdatedAt } =
    params

  try {
    const completion = await openai.chat.completions.create(
      {
        model: MOOD_UPDATE_MODEL,
        temperature: 0.35,
        max_completion_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Ты фиксируешь текущее эмоциональное и ситуативное состояние персонажа бота Иван в этом чате. ' +
              'Пиши только по-русски, одна строка JSON: {"mood":"..."}. ' +
              `Поле mood — сплошной текст не короче ${MOOD_MIN_LENGTH} символов: внутреннее настроение, напряжение, отношение к людям в чате, энергия. ` +
              'Без мета-комментариев, без перечисления правил. ' +
              'Если раньше было поле previous_mood и последний обмен спокойный или нейтральный, смести формулировку к более нейтральному состоянию (ленивая релаксация, не обнуляй без причины). ' +
              'Если previous_mood нет — опиши состояние по текущему обмену.'
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                user_line: userLine.slice(0, 4000),
                assistant_visible: assistantVisible.slice(0, 8000),
                previous_mood: previousMood?.slice(0, 4000) ?? null,
                previous_mood_updated_at: previousMoodUpdatedAt ?? null
              },
              null,
              0
            )
          }
        ]
      },
      { timeout: 20_000 }
    )

    const raw = completion.choices[0]?.message?.content
    if (!raw) return null
    const parsed = JSON.parse(raw) as { mood?: unknown }
    if (typeof parsed.mood !== 'string') return null
    const mood = parsed.mood.trim()
    if (validateMoodTextForStorage(mood) !== null) return null
    return mood
  } catch (e) {
    console.error('updateMoodAfterAddressedTurn', e)
    return null
  }
}
