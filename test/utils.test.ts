import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  delay,
  isReply,
  getRandomValueArr,
  findByEmoji,
  base64ToBlob
} from '../src/utils'
import type { Sticker } from '../src/types'

describe('utils', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('delay', () => {
    it('should resolve after 5000ms', async () => {
      const promise = delay()
      vi.advanceTimersByTime(5000)
      await expect(promise).resolves.toBeUndefined()
    })

    it('should not resolve before 5000ms', async () => {
      const promise = delay()
      vi.advanceTimersByTime(4999)
      let resolved = false
      promise.then(() => {
        resolved = true
      })
      expect(resolved).toBe(false)
      vi.advanceTimersByTime(1)
      await promise
      expect(resolved).toBe(true)
    })
  })

  describe('getRandomValueArr', () => {
    it('should return a random value from array', () => {
      const arr = [1, 2, 3, 4, 5]
      const result = getRandomValueArr(arr)
      expect(arr).toContain(result)
    })

    it('should return the only element for single item array', () => {
      const arr = [42]
      expect(getRandomValueArr(arr)).toBe(42)
    })

    it('should handle string arrays', () => {
      const arr = ['a', 'b', 'c']
      const result = getRandomValueArr(arr)
      expect(arr).toContain(result)
    })
  })

  describe('findByEmoji', () => {
    it('should find sticker by emoji', () => {
      const stickers: Sticker[] = [
        { emoji: '👍', set_name: 'pack1', file_id: 'file1' },
        { emoji: '❤️', set_name: 'pack2', file_id: 'file2' },
        { emoji: '🔥', set_name: 'pack3', file_id: 'file3' }
      ]

      const result = findByEmoji(stickers, '❤️')
      expect(result).toEqual(stickers[1])
    })

    it('should return random sticker if emoji not found', () => {
      const stickers: Sticker[] = [
        { emoji: '👍', set_name: 'pack1', file_id: 'file1' },
        { emoji: '❤️', set_name: 'pack2', file_id: 'file2' }
      ]

      const result = findByEmoji(stickers, '🔥')
      expect(stickers).toContain(result)
    })

    it('should handle undefined emoji in stickers', () => {
      const stickers: Sticker[] = [
        { emoji: undefined, set_name: 'pack1', file_id: 'file1' },
        { emoji: '👍', set_name: 'pack2', file_id: 'file2' }
      ]

      const result = findByEmoji(stickers, '👍')
      expect(result).toEqual(stickers[1])
    })
  })

  describe('isReply', () => {
    it('should return true when random is less than chance', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.3)
      expect(isReply('0.5')).toBe(true)
    })

    it('should return false when random is greater than chance', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.7)
      expect(isReply('0.5')).toBe(false)
    })

    it('should handle edge case where random equals chance', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      // 0.5 < 0.5 is false, so should return false
      expect(isReply('0.5')).toBe(false)
    })

    it('should handle string chance values', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1)
      expect(isReply('0.2')).toBe(true)
      expect(isReply('0.05')).toBe(false)
    })
  })

  describe('base64ToBlob', () => {
    it('should convert base64 string to Blob', () => {
      const base64 = 'SGVsbG8gV29ybGQ=' // "Hello World" in base64
      const blob = base64ToBlob(base64, 'text/plain')

      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('text/plain')
      expect(blob.size).toBe(11) // "Hello World" length
    })

    it('should handle different MIME types', () => {
      const base64 = 'SGVsbG8='
      const blob = base64ToBlob(base64, 'image/png')
      expect(blob.type).toBe('image/png')
    })

    it('should handle empty base64 string', () => {
      const blob = base64ToBlob('', 'text/plain')
      expect(blob.size).toBe(0)
    })
  })
})

