import { describe, it, expect, vi } from 'vitest'
import { createGptService } from '../../src/services/GptService'
import OpenAI from 'openai'

vi.mock('openai', () => {
  const mockCreate = vi.fn()
  const mockCompletions = { create: mockCreate }
  const mockChat = { completions: mockCompletions }
  const MockOpenAI = vi.fn(() => ({
    chat: mockChat
  }))
  return {
    __esModule: true,
    default: MockOpenAI,
    OpenAI: MockOpenAI
  }
})

describe('GptService', () => {
  const gptService = createGptService('test-api-key')
  const mockCreate = new OpenAI().chat.completions.create

  it('should call openai with the correct parameters', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [{ type: 'text', content: 'Hello' }]
            })
          }
        }
      ]
    }
    mockCreate.mockResolvedValue(mockResponse)

    await gptService.generateResponse(
      'user message',
      'message history',
      'custom prompt',
      'image_url',
      'memories'
    )

    expect(mockCreate).toHaveBeenCalled()
    const calledOptions = mockCreate.mock.calls[0][0]
    expect(calledOptions.model).toBeDefined()
    expect(calledOptions.messages[0].role).toBe('user')
    expect(calledOptions.messages[1].role).toBe('system')
  })
})
