import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTelegramFileClient,
  collectImageInputs
} from '../../src/bot/media'
import type { Context } from 'telegraf'
import axios from 'axios'

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn()
  }
}))

describe('Media Functions', () => {
  describe('createTelegramFileClient', () => {
    it('should create axios instance with correct base URL and timeout', () => {
      const mockAxiosInstance = {
        get: vi.fn(),
        post: vi.fn()
      }

      vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as any)

      const client = createTelegramFileClient()

      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.telegram.org/',
        timeout: 1000
      })
      expect(client).toBe(mockAxiosInstance)
    })
  })

  describe('collectImageInputs', () => {
    let mockCtx: Partial<Context>
    let mockDeps: any
    let mockTelegram: any
    let mockFileClient: any

    beforeEach(() => {
      vi.clearAllMocks()

      mockTelegram = {
        getFile: vi.fn()
      }

      mockFileClient = {
        get: vi.fn()
      }

      mockDeps = {
        telegram: mockTelegram,
        botToken: 'test-bot-token',
        fileClient: mockFileClient
      }

      mockCtx = {
        message: {}
      }
    })

    it('should collect image from photo array', async () => {
      const mockFile = {
        file_path: 'photos/file_123.jpg'
      }
      const mockResponse = {
        data: Buffer.from('fake-image-data')
      }

      mockCtx.message = {
        photo: [
          { file_id: 'small', file_unique_id: 'small_unique' },
          { file_id: 'medium', file_unique_id: 'medium_unique' },
          { file_id: 'large', file_unique_id: 'large_unique' }
        ]
      } as any

      mockTelegram.getFile.mockResolvedValue(mockFile)
      mockFileClient.get.mockResolvedValue(mockResponse)

      const result = await collectImageInputs(mockCtx as Context, mockDeps)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        type: 'input_image',
        image_url: expect.stringContaining('data:image/jpeg;base64,'),
        detail: 'auto'
      })
      expect(mockTelegram.getFile).toHaveBeenCalledWith('large')
      expect(mockFileClient.get).toHaveBeenCalledWith(
        'file/bottest-bot-token/photos/file_123.jpg',
        { responseType: 'arraybuffer' }
      )
    })

    it('should collect image from document with image mime type', async () => {
      const mockFile = {
        file_path: 'documents/image.png'
      }
      const mockResponse = {
        data: Buffer.from('fake-image-data')
      }

      mockCtx.message = {
        document: {
          file_id: 'doc_123',
          mime_type: 'image/png',
          file_name: 'image.png'
        }
      } as any

      mockTelegram.getFile.mockResolvedValue(mockFile)
      mockFileClient.get.mockResolvedValue(mockResponse)

      const result = await collectImageInputs(mockCtx as Context, mockDeps)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        type: 'input_image',
        image_url: expect.stringContaining('data:image/png;base64,'),
        detail: 'auto'
      })
      expect(mockTelegram.getFile).toHaveBeenCalledWith('doc_123')
    })

    it('should ignore document with non-image mime type', async () => {
      mockCtx.message = {
        document: {
          file_id: 'doc_123',
          mime_type: 'application/pdf',
          file_name: 'document.pdf'
        }
      } as any

      const result = await collectImageInputs(mockCtx as Context, mockDeps)

      expect(result).toHaveLength(0)
      expect(mockTelegram.getFile).not.toHaveBeenCalled()
    })

    it('should return empty array when no photo or document', async () => {
      mockCtx.message = {
        text: 'Just text message'
      } as any

      const result = await collectImageInputs(mockCtx as Context, mockDeps)

      expect(result).toHaveLength(0)
    })

    it('should handle getFile error gracefully', async () => {
      mockCtx.message = {
        photo: [{ file_id: 'photo_123', file_unique_id: 'unique_123' }]
      } as any

      mockTelegram.getFile.mockRejectedValue(new Error('File not found'))

      const result = await collectImageInputs(mockCtx as Context, mockDeps)

      expect(result).toHaveLength(0)
    })

    it('should handle file download error gracefully', async () => {
      const mockFile = {
        file_path: 'photos/file_123.jpg'
      }

      mockCtx.message = {
        photo: [{ file_id: 'photo_123', file_unique_id: 'unique_123' }]
      } as any

      mockTelegram.getFile.mockResolvedValue(mockFile)
      mockFileClient.get.mockRejectedValue(new Error('Download failed'))

      const result = await collectImageInputs(mockCtx as Context, mockDeps)

      expect(result).toHaveLength(0)
    })

    it('should handle file without file_path', async () => {
      const mockFile = {
        file_id: 'file_123'
        // No file_path
      }

      mockCtx.message = {
        photo: [{ file_id: 'photo_123', file_unique_id: 'unique_123' }]
      } as any

      mockTelegram.getFile.mockResolvedValue(mockFile)

      const result = await collectImageInputs(mockCtx as Context, mockDeps)

      expect(result).toHaveLength(0)
      expect(mockFileClient.get).not.toHaveBeenCalled()
    })

    it('should handle different image formats correctly', async () => {
      const testCases = [
        { path: 'image.png', mime: 'image/png' },
        { path: 'image.webp', mime: 'image/webp' },
        { path: 'image.gif', mime: 'image/gif' },
        { path: 'image.bmp', mime: 'image/bmp' },
        { path: 'image.jpeg', mime: 'image/jpeg' },
        { path: 'image.jpg', mime: 'image/jpeg' }
      ]

      for (const testCase of testCases) {
        vi.clearAllMocks()

        const mockFile = {
          file_path: testCase.path
        }
        const mockResponse = {
          data: Buffer.from('fake-image-data')
        }

        mockCtx.message = {
          document: {
            file_id: 'doc_123',
            mime_type: testCase.mime,
            file_name: testCase.path
          }
        } as any

        mockTelegram.getFile.mockResolvedValue(mockFile)
        mockFileClient.get.mockResolvedValue(mockResponse)

        const result = await collectImageInputs(mockCtx as Context, mockDeps)

        expect(result).toHaveLength(1)
        expect(result[0].image_url).toContain(`data:${testCase.mime};base64,`)
      }
    })

    it('should use document mime type when provided', async () => {
      const mockFile = {
        file_path: 'image.unknown'
      }
      const mockResponse = {
        data: Buffer.from('fake-image-data')
      }

      mockCtx.message = {
        document: {
          file_id: 'doc_123',
          mime_type: 'image/unknown',
          file_name: 'image.unknown'
        }
      } as any

      mockTelegram.getFile.mockResolvedValue(mockFile)
      mockFileClient.get.mockResolvedValue(mockResponse)

      const result = await collectImageInputs(mockCtx as Context, mockDeps)

      expect(result).toHaveLength(1)
      // Should use the provided mime_type from document
      expect(result[0].image_url).toContain('data:image/unknown;base64,')
    })

    it('should default to jpeg mime type for unknown extensions when no mime_type provided', async () => {
      const mockFile = {
        file_path: 'image.unknown'
      }
      const mockResponse = {
        data: Buffer.from('fake-image-data')
      }

      mockCtx.message = {
        photo: [{ file_id: 'photo_123', file_unique_id: 'unique_123' }]
      } as any

      mockTelegram.getFile.mockResolvedValue(mockFile)
      mockFileClient.get.mockResolvedValue(mockResponse)

      const result = await collectImageInputs(mockCtx as Context, mockDeps)

      expect(result).toHaveLength(1)
      // Should default to image/jpeg for unknown extensions when no mime_type
      expect(result[0].image_url).toContain('data:image/jpeg;base64,')
    })
  })
})
