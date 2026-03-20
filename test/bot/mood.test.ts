import { describe, it, expect } from 'vitest'
import {
  MOOD_MIN_LENGTH,
  validateMoodTextForStorage,
  isRussianMoodText,
  resolveMoodForInjection,
  validateChatSettingsPatchPartial
} from '../../src/bot/mood'
import type { ChatSettings } from '../../src/types'

const validRu =
  'а'.repeat(MOOD_MIN_LENGTH) +
  ' тест настроения в чате, внутреннее напряжение и отношение к участникам без латиницы только кириллица для проверки длины текста настроения бота в сессии'

describe('mood validation', () => {
  it('rejects short text', () => {
    expect(validateMoodTextForStorage('коротко')).toBe(
      `mood_text must be at least ${MOOD_MIN_LENGTH} characters`
    )
  })

  it('rejects Latin letters', () => {
    const bad = 'а'.repeat(MOOD_MIN_LENGTH) + ' bad'
    expect(validateMoodTextForStorage(bad)).toBe(
      'mood_text must be Russian (Cyrillic) only, no Latin letters'
    )
  })

  it('accepts long Cyrillic-only mood', () => {
    expect(validateMoodTextForStorage(validRu)).toBe(null)
    expect(isRussianMoodText(validRu)).toBe(true)
  })

  it('resolveMoodForInjection returns undefined for invalid stored value', () => {
    const cs: ChatSettings = { mood_text: 'short' }
    expect(resolveMoodForInjection(cs)).toBeUndefined()
  })

  it('resolveMoodForInjection returns trimmed text when valid', () => {
    const cs: ChatSettings = { mood_text: `  ${validRu}  ` }
    expect(resolveMoodForInjection(cs)).toBe(validRu.trim())
  })

  it('validateChatSettingsPatchPartial allows empty mood_text (clear)', () => {
    expect(validateChatSettingsPatchPartial({ mood_text: '' })).toBe(null)
  })

  it('validateChatSettingsPatchPartial rejects invalid mood', () => {
    expect(validateChatSettingsPatchPartial({ mood_text: 'x' })?.length).toBeGreaterThan(
      0
    )
  })
})
