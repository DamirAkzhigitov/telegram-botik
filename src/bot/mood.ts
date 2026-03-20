import OpenAI from 'openai'
import { BOT_DISPLAY_NAME } from './constants'
import type { ChatSettings, PersonaMoodState } from '../types'

/** §6: free-text mood minimum length (Russian). */
export const MOOD_MIN_LENGTH = 150

export const MOOD_UPDATE_MODEL = 'gpt-4.1-mini'

/** Per-field cap for persona_mood strings (injection + storage). */
export const PERSONA_MOOD_FIELD_MAX = 450

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

function isRussianPersonaLine(text: string): boolean {
  if (LATIN_LETTER.test(text)) return false
  const cyrillic = (text.match(/[А-Яа-яЁё]/g) ?? []).length
  return cyrillic >= 12
}

/** social_edges: allow Latin (Telegram @usernames). */
function isSocialEdgesLine(text: string): boolean {
  const t = text.trim()
  if (t.length < 8) return false
  return t.length <= PERSONA_MOOD_FIELD_MAX
}

/**
 * Validates optional persona fields; omits empty. Returns normalized object or error string.
 */
export function validatePersonaMoodForStorage(
  raw: PersonaMoodState | undefined | null
): { ok: true; value: PersonaMoodState } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: {} }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'persona_mood must be an object' }
  }
  const out: PersonaMoodState = {}
  const keys: (keyof PersonaMoodState)[] = [
    'thinking_now',
    'in_mind',
    'next_to_discuss',
    'social_edges'
  ]
  for (const k of keys) {
    const v = raw[k]
    if (v === undefined || v === null) continue
    if (typeof v !== 'string') {
      return { ok: false, error: `persona_mood.${k} must be a string` }
    }
    const t = v.trim()
    if (t.length === 0) continue
    if (t.length > PERSONA_MOOD_FIELD_MAX) {
      return {
        ok: false,
        error: `persona_mood.${k} must be at most ${PERSONA_MOOD_FIELD_MAX} characters`
      }
    }
    if (k === 'social_edges') {
      if (!isSocialEdgesLine(t)) {
        return {
          ok: false,
          error: 'persona_mood.social_edges must be at least 8 characters'
        }
      }
      out[k] = t
    } else {
      if (t.length < 15) {
        return {
          ok: false,
          error: `persona_mood.${k} must be at least 15 characters when set`
        }
      }
      if (!isRussianPersonaLine(t)) {
        return {
          ok: false,
          error: `persona_mood.${k} must be Russian (Cyrillic) only, no Latin letters`
        }
      }
      out[k] = t
    }
  }
  return { ok: true, value: out }
}

/** Inject into main model when at least one valid field is present. */
export function resolvePersonaMoodForInjection(
  cs: ChatSettings | undefined
): string | undefined {
  const v = validatePersonaMoodForStorage(cs?.persona_mood)
  if (!v.ok || Object.keys(v.value).length === 0) return undefined
  return formatPersonaMoodDeveloperBlock(v.value)
}

export function formatPersonaMoodDeveloperBlock(p: PersonaMoodState): string {
  const lines: string[] = [
    'Внутреннее состояние персонажа (не зачитывай дословно; веди себя как живой человек в чате, а не как универсальный помощник):'
  ]
  if (p.thinking_now?.trim())
    lines.push(`Сейчас думаю о: ${p.thinking_now.trim()}`)
  if (p.in_mind?.trim()) lines.push(`В голове держу: ${p.in_mind.trim()}`)
  if (p.next_to_discuss?.trim())
    lines.push(
      `Хочу дальше обсудить / к чему выйти: ${p.next_to_discuss.trim()}`
    )
  if (p.social_edges?.trim())
    lines.push(
      `Люди в чате (к кому тепло, к кому холодно): ${p.social_edges.trim()}`
    )
  return lines.join('\n')
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
  if ('persona_mood' in cs) {
    const pm = cs.persona_mood
    if (pm === null || pm === undefined) return null
    const r = validatePersonaMoodForStorage(pm as PersonaMoodState)
    if (!r.ok) return r.error
  }
  if (!('mood_text' in cs)) return null
  const v = cs.mood_text
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return 'mood_text must be a string'
  if (v.length === 0) return null
  return validateMoodTextForStorage(v)
}

export interface PersonaMoodUpdateResult {
  mood: string | null
  persona: PersonaMoodState | null
}

function fingerprintPersona(p: PersonaMoodState | undefined): string {
  if (!p) return ''
  return JSON.stringify({
    thinking_now: p.thinking_now ?? '',
    in_mind: p.in_mind ?? '',
    next_to_discuss: p.next_to_discuss ?? '',
    social_edges: p.social_edges ?? ''
  })
}

export function personaMoodChanged(
  prev: PersonaMoodState | undefined,
  next: PersonaMoodState | null
): boolean {
  return (
    fingerprintPersona(prev ?? undefined) !==
    fingerprintPersona(next ?? undefined)
  )
}

/** One line for memories when persona_mood updates (capped). */
export function formatPersonaMoodMemoryLine(p: PersonaMoodState): string {
  const bits: string[] = []
  if (p.thinking_now?.trim())
    bits.push(`мысли: ${p.thinking_now.trim().slice(0, 100)}`)
  if (p.in_mind?.trim())
    bits.push(`в голове: ${p.in_mind.trim().slice(0, 100)}`)
  if (p.next_to_discuss?.trim())
    bits.push(`дальше: ${p.next_to_discuss.trim().slice(0, 100)}`)
  if (p.social_edges?.trim())
    bits.push(`люди: ${p.social_edges.trim().slice(0, 140)}`)
  return `Состояние: ${bits.join('; ')}`.slice(0, 450)
}

/**
 * After an addressed full reply (or proactive send), refresh mood_text + persona_mood.
 * Lazy decay: prompt asks to soften toward neutral when the exchange is calm.
 */
export async function updateMoodAfterAddressedTurn(
  openai: OpenAI,
  params: {
    userLine: string
    assistantVisible: string
    previousMood?: string
    previousMoodUpdatedAt?: string
    previousPersona?: PersonaMoodState
  }
): Promise<PersonaMoodUpdateResult> {
  const {
    userLine,
    assistantVisible,
    previousMood,
    previousMoodUpdatedAt,
    previousPersona
  } = params

  try {
    const completion = await openai.chat.completions.create(
      {
        model: MOOD_UPDATE_MODEL,
        temperature: 0.35,
        max_completion_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              `Ты фиксируешь состояние персонажа бота ${BOT_DISPLAY_NAME} в этом чате. Пиши только по-русски. ` +
              'Один JSON-объект без другого текста. Поля:\n' +
              '- mood (строка, обязательно): сплошной текст не короче ' +
              MOOD_MIN_LENGTH +
              ' символов — эмоции, энергия, напряжение, тон; только кириллица, без латиницы.\n' +
              '- thinking_now (строка, по желанию): о чём сейчас крутятся мысли, 15–' +
              PERSONA_MOOD_FIELD_MAX +
              ' символов; только кириллица.\n' +
              '- in_mind (строка, по желанию): что держишь в голове, фон, 15–' +
              PERSONA_MOOD_FIELD_MAX +
              ' символов; только кириллица.\n' +
              '- next_to_discuss (строка, по желанию): о чём хочешь выйти в разговоре, 15–' +
              PERSONA_MOOD_FIELD_MAX +
              ' символов; только кириллица.\n' +
              '- social_edges (строка, по желанию): к кому тепло, к кому холодно / раздражает; ники как в чате; 8–' +
              PERSONA_MOOD_FIELD_MAX +
              ' символов; здесь допускается латиница в никах.\n' +
              'Пустые необязательные поля можно опустить или задать пустой строкой. ' +
              'Персонаж не обязан всем помогать и не обязан всем нравиться — отрази это в mood и social_edges при необходимости. ' +
              'Если раньше был previous_mood и последний обмен спокойный или нейтральный, смести формулировку mood к более нейтральному (ленивая релаксация, не обнуляй без причины). ' +
              'Если previous_mood нет — опиши состояние по текущему обмену.'
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                user_line: userLine.slice(0, 4000),
                assistant_visible: assistantVisible.slice(0, 8000),
                previous_mood: previousMood?.slice(0, 4000) ?? null,
                previous_mood_updated_at: previousMoodUpdatedAt ?? null,
                previous_persona: previousPersona ?? null
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
    if (!raw) return { mood: null, persona: null }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (typeof parsed.mood !== 'string') return { mood: null, persona: null }
    const mood = parsed.mood.trim()
    if (validateMoodTextForStorage(mood) !== null) {
      return { mood: null, persona: null }
    }

    const personaRaw: PersonaMoodState = {}
    for (const key of [
      'thinking_now',
      'in_mind',
      'next_to_discuss',
      'social_edges'
    ] as const) {
      const val = parsed[key]
      if (typeof val === 'string' && val.trim().length > 0) {
        personaRaw[key] = val.trim()
      }
    }

    const personaCheck = validatePersonaMoodForStorage(personaRaw)
    const persona =
      personaCheck.ok && Object.keys(personaCheck.value).length > 0
        ? personaCheck.value
        : null

    return { mood, persona }
  } catch (e) {
    console.error('updateMoodAfterAddressedTurn', e)
    return { mood: null, persona: null }
  }
}
