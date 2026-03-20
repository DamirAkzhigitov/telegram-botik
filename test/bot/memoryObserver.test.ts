import { describe, it, expect, vi, beforeEach } from 'vitest'
import OpenAI from 'openai'
import {
  extractBackgroundMemories,
  formatRecentHistoryForObserver,
  plainTextFromHistoryMessage
} from '../../src/bot/memoryObserver'
import type { SessionData } from '../../src/types'

describe('memoryObserver', () => {
  describe('plainTextFromHistoryMessage', () => {
    it('joins user input_text parts', () => {
      const m = {
        role: 'user' as const,
        content: [{ type: 'input_text' as const, text: 'hi there' }]
      }
      expect(plainTextFromHistoryMessage(m)).toBe('hi there')
    })

    it('reads assistant output_text', () => {
      const m = {
        role: 'assistant' as const,
        content: [{ type: 'output_text' as const, text: 'yo' }]
      }
      expect(plainTextFromHistoryMessage(m)).toBe('yo')
    })
  })

  describe('formatRecentHistoryForObserver', () => {
    it('builds tail with U/A labels within char budget', () => {
      const messages = [
        {
          role: 'user' as const,
          content: [{ type: 'input_text' as const, text: 'old' }]
        },
        {
          role: 'assistant' as const,
          content: [{ type: 'output_text' as const, text: 'ack' }]
        },
        {
          role: 'user' as const,
          content: [{ type: 'input_text' as const, text: 'new' }]
        }
      ] as SessionData['userMessages']

      const s = formatRecentHistoryForObserver(messages, 500)
      expect(s).toContain('U: old')
      expect(s).toContain('A: ack')
      expect(s).toContain('U: new')
    })
  })

  describe('extractBackgroundMemories', () => {
    let openai: OpenAI

    beforeEach(() => {
      openai = {
        chat: {
          completions: {
            create: vi.fn()
          }
        }
      } as unknown as OpenAI
    })

    it('returns empty when latest line is blank', async () => {
      const r = await extractBackgroundMemories(openai, {
        latestUserLine: '   ',
        recentTranscript: '',
        existingMemorySnippets: []
      })
      expect(r).toEqual([])
      expect(openai.chat.completions.create).not.toHaveBeenCalled()
    })

    it('parses memories array from JSON response', async () => {
      vi.mocked(openai.chat.completions.create).mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                memories: ['fact one', 'fact two']
              })
            }
          }
        ]
      } as any)

      const r = await extractBackgroundMemories(openai, {
        latestUserLine: 'alice loves tea',
        recentTranscript: 'U: hi',
        existingMemorySnippets: []
      })

      expect(r).toEqual(['fact one', 'fact two'])
      expect(openai.chat.completions.create).toHaveBeenCalled()
    })

    it('returns empty on malformed JSON', async () => {
      vi.mocked(openai.chat.completions.create).mockResolvedValue({
        choices: [{ message: { content: 'not-json' } }]
      } as any)

      const r = await extractBackgroundMemories(openai, {
        latestUserLine: 'x',
        recentTranscript: '',
        existingMemorySnippets: []
      })

      expect(r).toEqual([])
    })

    it('returns empty on API error', async () => {
      vi.mocked(openai.chat.completions.create).mockRejectedValue(
        new Error('timeout')
      )

      const r = await extractBackgroundMemories(openai, {
        latestUserLine: 'x',
        recentTranscript: '',
        existingMemorySnippets: []
      })

      expect(r).toEqual([])
    })
  })
})
