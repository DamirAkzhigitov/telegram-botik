import { describe, it, expect } from 'vitest'
import {
  ALLOWED_TEXT_MODELS,
  DEFAULT_TEXT_MODEL,
  findAllowedModel,
  resolveModelChoice,
  isAllowedModel
} from '../../src/constants/models'

describe('models constants', () => {
  describe('ALLOWED_TEXT_MODELS', () => {
    it('should be an array of strings', () => {
      expect(Array.isArray(ALLOWED_TEXT_MODELS)).toBe(true)
      expect(ALLOWED_TEXT_MODELS.length).toBeGreaterThan(0)
      ALLOWED_TEXT_MODELS.forEach((model) => {
        expect(typeof model).toBe('string')
      })
    })

    it('should contain expected models', () => {
      expect(ALLOWED_TEXT_MODELS).toContain('gpt-5-mini-2025-08-07')
      expect(ALLOWED_TEXT_MODELS).toContain('gpt-4.1-mini')
      expect(ALLOWED_TEXT_MODELS).toContain('gpt-4.1')
    })
  })

  describe('DEFAULT_TEXT_MODEL', () => {
    it('should be the first model in ALLOWED_TEXT_MODELS', () => {
      expect(DEFAULT_TEXT_MODEL).toBe(ALLOWED_TEXT_MODELS[0])
    })

    it('should be a valid allowed model', () => {
      expect(ALLOWED_TEXT_MODELS).toContain(DEFAULT_TEXT_MODEL)
    })
  })

  describe('findAllowedModel', () => {
    it('should return undefined for undefined input', () => {
      expect(findAllowedModel(undefined)).toBeUndefined()
    })

    it('should return undefined for empty string', () => {
      expect(findAllowedModel('')).toBeUndefined()
    })

    it('should find model with exact match', () => {
      expect(findAllowedModel('gpt-5-mini-2025-08-07')).toBe('gpt-5-mini-2025-08-07')
      expect(findAllowedModel('gpt-4.1-mini')).toBe('gpt-4.1-mini')
      expect(findAllowedModel('gpt-4.1')).toBe('gpt-4.1')
    })

    it('should find model case-insensitively', () => {
      expect(findAllowedModel('GPT-5-MINI-2025-08-07')).toBe('gpt-5-mini-2025-08-07')
      expect(findAllowedModel('GPT-4.1-MINI')).toBe('gpt-4.1-mini')
    })

    it('should handle whitespace', () => {
      expect(findAllowedModel('  gpt-5-mini-2025-08-07  ')).toBe('gpt-5-mini-2025-08-07')
      expect(findAllowedModel(' gpt-4.1 ')).toBe('gpt-4.1')
    })

    it('should return undefined for invalid model', () => {
      expect(findAllowedModel('invalid-model')).toBeUndefined()
      expect(findAllowedModel('gpt-3.5')).toBeUndefined()
    })
  })

  describe('resolveModelChoice', () => {
    it('should return found model if valid', () => {
      expect(resolveModelChoice('gpt-4.1-mini')).toBe('gpt-4.1-mini')
    })

    it('should return DEFAULT_TEXT_MODEL if undefined', () => {
      expect(resolveModelChoice(undefined)).toBe(DEFAULT_TEXT_MODEL)
    })

    it('should return DEFAULT_TEXT_MODEL if invalid model', () => {
      expect(resolveModelChoice('invalid')).toBe(DEFAULT_TEXT_MODEL)
    })

    it('should return DEFAULT_TEXT_MODEL for empty string', () => {
      expect(resolveModelChoice('')).toBe(DEFAULT_TEXT_MODEL)
    })

    it('should handle case-insensitive matching', () => {
      expect(resolveModelChoice('GPT-4.1')).toBe('gpt-4.1')
    })
  })

  describe('isAllowedModel', () => {
    it('should return true for valid model', () => {
      expect(isAllowedModel('gpt-5-mini-2025-08-07')).toBe(true)
      expect(isAllowedModel('gpt-4.1-mini')).toBe(true)
      expect(isAllowedModel('gpt-4.1')).toBe(true)
    })

    it('should return false for undefined', () => {
      expect(isAllowedModel(undefined)).toBe(false)
    })

    it('should return false for invalid model', () => {
      expect(isAllowedModel('invalid-model')).toBe(false)
      expect(isAllowedModel('gpt-3.5')).toBe(false)
    })

    it('should handle case-insensitive matching', () => {
      expect(isAllowedModel('GPT-5-MINI-2025-08-07')).toBe(true)
    })

    it('should return false for empty string', () => {
      expect(isAllowedModel('')).toBe(false)
    })
  })
})

