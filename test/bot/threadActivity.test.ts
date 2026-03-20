import { describe, it, expect } from 'vitest'
import type { Context } from 'telegraf'
import {
  THREAD_ACTIVITY_DEFAULT_KEY,
  resolveThreadActivityKey
} from '../../src/bot/threadActivity'

function ctx(partial: Partial<Context>): Context {
  return partial as Context
}

describe('threadActivity', () => {
  describe('resolveThreadActivityKey', () => {
    it('uses default when chat is missing', () => {
      expect(resolveThreadActivityKey(ctx({ chat: undefined }))).toBe(
        THREAD_ACTIVITY_DEFAULT_KEY
      )
    })

    it('uses default for private chats', () => {
      expect(
        resolveThreadActivityKey(
          ctx({
            chat: { id: 1, type: 'private' } as any,
            message: { message_thread_id: 99 } as any
          })
        )
      ).toBe(THREAD_ACTIVITY_DEFAULT_KEY)
    })

    it('uses default for basic groups', () => {
      expect(
        resolveThreadActivityKey(
          ctx({
            chat: { id: -1, type: 'group' } as any,
            message: {} as any
          })
        )
      ).toBe(THREAD_ACTIVITY_DEFAULT_KEY)
    })

    it('uses message_thread_id string for supergroups with topic', () => {
      expect(
        resolveThreadActivityKey(
          ctx({
            chat: { id: -100, type: 'supergroup' } as any,
            message: { message_thread_id: 42 } as any
          })
        )
      ).toBe('42')
    })

    it('uses default for supergroup without message_thread_id', () => {
      expect(
        resolveThreadActivityKey(
          ctx({
            chat: { id: -100, type: 'supergroup' } as any,
            message: {} as any
          })
        )
      ).toBe(THREAD_ACTIVITY_DEFAULT_KEY)
    })
  })
})
