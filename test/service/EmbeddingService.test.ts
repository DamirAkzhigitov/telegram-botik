import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EmbeddingService } from '../../src/service/EmbeddingService'

// Mock Pinecone
const mockIndex = {
  upsert: vi.fn().mockResolvedValue({}),
  query: vi.fn().mockResolvedValue({
    matches: []
  })
}

const mockPinecone = {
  Index: vi.fn().mockReturnValue(mockIndex)
}

vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: vi.fn().mockImplementation(() => mockPinecone)
}))

// Mock OpenAI
const mockOpenAI = {
  embeddings: {
    create: vi.fn()
  }
}

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => mockOpenAI)
}))

describe('EmbeddingService', () => {
  let service: EmbeddingService
  let mockEnv: Env

  beforeEach(() => {
    vi.clearAllMocks()

    mockEnv = {
      PINECONE: 'test-pinecone-key',
      API_KEY: 'test-openai-key'
    } as Env

    service = new EmbeddingService(mockEnv)
  })

  describe('constructor', () => {
    it('should initialize services with env variables', () => {
      // Constructor is called in beforeEach, so we just verify the service was created
      expect(service.env).toBe(mockEnv)
      expect(service.pc).toBeDefined()
      expect(service.openai).toBeDefined()
    })
  })

  describe('saveMessage', () => {
    it('should save a message with embedding', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3]
      const mockEmbeddingResponse = {
        data: [
          {
            embedding: mockEmbedding
          }
        ]
      }

      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse)

      await service.saveMessage(12345, 'user', 'Hello world')

      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'Hello world',
        dimensions: 512
      })

      expect(mockPinecone.Index).toHaveBeenCalledWith('botik')

      expect(mockIndex.upsert).toHaveBeenCalledWith([
        {
          id: expect.stringMatching(/^12345-\d+$/),
          values: mockEmbedding,
          metadata: {
            chatId: '12345',
            role: 'user',
            content: 'Hello world',
            timestamp: expect.any(Number)
          }
        }
      ])
    })

    it('should use current timestamp in message ID', async () => {
      const mockEmbedding = [0.1, 0.2]
      const mockEmbeddingResponse = {
        data: [{ embedding: mockEmbedding }]
      }

      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse)

      const beforeTime = Date.now()
      await service.saveMessage(67890, 'assistant', 'Test message')
      const afterTime = Date.now()

      const upsertCall = mockIndex.upsert.mock.calls[0][0][0]
      const idParts = upsertCall.id.split('-')
      const timestamp = parseInt(idParts[1], 10)

      expect(idParts[0]).toBe('67890')
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(timestamp).toBeLessThanOrEqual(afterTime)
    })

    it('should handle different chat IDs and roles', async () => {
      const mockEmbedding = [0.1, 0.2]
      const mockEmbeddingResponse = {
        data: [{ embedding: mockEmbedding }]
      }

      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse)

      await service.saveMessage(111, 'user', 'User message')
      await service.saveMessage(222, 'assistant', 'Assistant message')
      await service.saveMessage(111, 'system', 'System message')

      expect(mockIndex.upsert).toHaveBeenCalledTimes(3)

      const calls = mockIndex.upsert.mock.calls
      expect(calls[0][0][0].metadata.chatId).toBe('111')
      expect(calls[0][0][0].metadata.role).toBe('user')
      expect(calls[1][0][0].metadata.chatId).toBe('222')
      expect(calls[1][0][0].metadata.role).toBe('assistant')
      expect(calls[2][0][0].metadata.chatId).toBe('111')
      expect(calls[2][0][0].metadata.role).toBe('system')
    })
  })

  describe('fetchRelevantMessages', () => {
    it('should fetch relevant messages with default topK', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3]
      const mockEmbeddingResponse = {
        data: [{ embedding: mockEmbedding }]
      }

      const mockMatches = [
        {
          metadata: {
            chatId: '12345',
            role: 'user',
            content: 'Message 1',
            timestamp: 1000
          }
        },
        {
          metadata: {
            chatId: '12345',
            role: 'assistant',
            content: 'Message 2',
            timestamp: 2000
          }
        }
      ]

      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse)
      mockIndex.query.mockResolvedValue({
        matches: mockMatches
      })

      const result = await service.fetchRelevantMessages(12345, 'query text')

      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'query text',
        dimensions: 512
      })

      expect(mockIndex.query).toHaveBeenCalledWith({
        vector: mockEmbedding,
        topK: 5,
        filter: { chatId: { $eq: '12345' } },
        includeMetadata: true
      })

      expect(result).toEqual(mockMatches.map(m => m.metadata))
    })

    it('should fetch relevant messages with custom topK', async () => {
      const mockEmbedding = [0.1, 0.2]
      const mockEmbeddingResponse = {
        data: [{ embedding: mockEmbedding }]
      }

      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse)
      mockIndex.query.mockResolvedValue({ matches: [] })

      await service.fetchRelevantMessages(12345, 'query', 10)

      expect(mockIndex.query).toHaveBeenCalledWith({
        vector: mockEmbedding,
        topK: 10,
        filter: { chatId: { $eq: '12345' } },
        includeMetadata: true
      })
    })

    it('should filter messages by chatId', async () => {
      const mockEmbedding = [0.1, 0.2]
      const mockEmbeddingResponse = {
        data: [{ embedding: mockEmbedding }]
      }

      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse)

      await service.fetchRelevantMessages(99999, 'search query')

      expect(mockIndex.query).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: { chatId: { $eq: '99999' } }
        })
      )
    })

    it('should return empty array when no matches found', async () => {
      const mockEmbedding = [0.1, 0.2]
      const mockEmbeddingResponse = {
        data: [{ embedding: mockEmbedding }]
      }

      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse)
      mockIndex.query.mockResolvedValue({ matches: [] })

      const result = await service.fetchRelevantMessages(12345, 'query')

      expect(result).toEqual([])
    })

    it('should handle multiple matches correctly', async () => {
      const mockEmbedding = [0.1, 0.2]
      const mockEmbeddingResponse = {
        data: [{ embedding: mockEmbedding }]
      }

      const mockMatches = [
        { metadata: { id: 1, content: 'First' } },
        { metadata: { id: 2, content: 'Second' } },
        { metadata: { id: 3, content: 'Third' } }
      ]

      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse)
      mockIndex.query.mockResolvedValue({ matches: mockMatches })

      const result = await service.fetchRelevantMessages(12345, 'query', 3)

      expect(result).toHaveLength(3)
      expect(result).toEqual(mockMatches.map(m => m.metadata))
    })
  })

  describe('saveSummary', () => {
    it('should save a summary with embedding and summary metadata', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3]
      const mockEmbeddingResponse = {
        data: [
          {
            embedding: mockEmbedding
          }
        ]
      }

      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse)

      await service.saveSummary(12345, 'This is a conversation summary about topic X')

      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'This is a conversation summary about topic X',
        dimensions: 512
      })

      expect(mockPinecone.Index).toHaveBeenCalledWith('botik')

      expect(mockIndex.upsert).toHaveBeenCalledWith([
        {
          id: expect.stringMatching(/^12345-summary-\d+$/),
          values: mockEmbedding,
          metadata: {
            chatId: '12345',
            type: 'summary',
            role: 'system',
            content: 'This is a conversation summary about topic X',
            timestamp: expect.any(Number)
          }
        }
      ])
    })

    it('should use current timestamp in summary ID', async () => {
      const mockEmbedding = [0.1, 0.2]
      const mockEmbeddingResponse = {
        data: [{ embedding: mockEmbedding }]
      }

      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse)

      const beforeTime = Date.now()
      await service.saveSummary(67890, 'Test summary')
      const afterTime = Date.now()

      const upsertCall = mockIndex.upsert.mock.calls[0][0][0]
      const idParts = upsertCall.id.split('-')
      const timestamp = parseInt(idParts[2], 10)

      expect(idParts[0]).toBe('67890')
      expect(idParts[1]).toBe('summary')
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(timestamp).toBeLessThanOrEqual(afterTime)
    })
  })

  describe('fetchRelevantSummaries', () => {
    it('should fetch relevant summaries with default topK', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3]
      const mockEmbeddingResponse = {
        data: [{ embedding: mockEmbedding }]
      }

      const mockMatches = [
        {
          metadata: {
            chatId: '12345',
            type: 'summary',
            role: 'system',
            content: 'Summary 1',
            timestamp: 1000
          }
        },
        {
          metadata: {
            chatId: '12345',
            type: 'summary',
            role: 'system',
            content: 'Summary 2',
            timestamp: 2000
          }
        }
      ]

      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse)
      mockIndex.query.mockResolvedValue({
        matches: mockMatches
      })

      const result = await service.fetchRelevantSummaries(12345, 'query text')

      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'query text',
        dimensions: 512
      })

      expect(mockIndex.query).toHaveBeenCalledWith({
        vector: mockEmbedding,
        topK: 20,
        filter: {
          chatId: { $eq: '12345' },
          type: { $eq: 'summary' }
        },
        includeMetadata: true
      })

      expect(result).toEqual(mockMatches.map(m => m.metadata))
    })

    it('should filter summaries by chatId and type', async () => {
      const mockEmbedding = [0.1, 0.2]
      const mockEmbeddingResponse = {
        data: [{ embedding: mockEmbedding }]
      }

      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse)

      await service.fetchRelevantSummaries(99999, 'search query')

      expect(mockIndex.query).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            chatId: { $eq: '99999' },
            type: { $eq: 'summary' }
          }
        })
      )
    })

    it('should return empty array when no summaries found', async () => {
      const mockEmbedding = [0.1, 0.2]
      const mockEmbeddingResponse = {
        data: [{ embedding: mockEmbedding }]
      }

      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse)
      mockIndex.query.mockResolvedValue({ matches: [] })

      const result = await service.fetchRelevantSummaries(12345, 'query')

      expect(result).toEqual([])
    })
  })
})
