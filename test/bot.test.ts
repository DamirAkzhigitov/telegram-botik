import { beforeEach, describe, expect, test, vi } from 'vitest'
import { getOpenAIClient } from '../src/gpt'

const mockResponse = vi.fn()

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      return {
        responses: {
          create: mockResponse
        }
      }
    })
  }
})

describe('BotService', () => {
  beforeEach(() => {
    mockResponse.mockReset()
  })

  test('Should return a list of messages', async () => {
    mockResponse.mockResolvedValueOnce({
      status: 'success',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                items: [{
                  type: 'text',
                  content: 'Привет! О какой Славе речь — твой друг, коллега или какая‑то публичная личность? Без контекста трудно угадать. Могу предположить общие варианты: студент, программист/инженер, музыкант/артист, маркетолог/менеджер или предприниматель. Скажи чуть больше (фамилия, где видел, что публикует) — помогу точнее или подскажу, как узнать.'
                }]
              })
            }
          ]
        }
      ]
    })

    const { responseApi } = getOpenAIClient('KEY')

    const response = await responseApi([
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Привет, как думаешь чем слава занимается?'
          }
        ]
      }
    ])

    expect(response).toEqual(
      [{
        'type': 'text',
        'content': 'Привет! О какой Славе речь — твой друг, коллега или какая‑то публичная личность? Без контекста трудно угадать. Могу предположить общие варианты: студент, программист/инженер, музыкант/артист, маркетолог/менеджер или предприниматель. Скажи чуть больше (фамилия, где видел, что публикует) — помогу точнее или подскажу, как узнать.'
      }]
    )
  })

  test('Should return null in case of error', async () => {
    mockResponse.mockResolvedValueOnce({
      status: 'incomplete',
      incomplete_details: {
        reason: 'Not valid request'
      },
      output: []
    })

    const { responseApi } = getOpenAIClient('KEY')

    const response = await responseApi([
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Привет, как думаешь чем слава занимается?'
          }
        ]
      }
    ])

    expect(response).toEqual(null)
  })

  test('Should handle error exceptions', async () => {
    mockResponse.mockRejectedValueOnce(new Error('API error'))

    const { responseApi } = getOpenAIClient('KEY')

    const response = await responseApi([])

    expect(response).toEqual(null)
  })

  test('Should use custom prompt when provided', async () => {
    mockResponse.mockResolvedValueOnce({
      status: 'success',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                items: [{ type: 'text', content: 'response' }]
              })
            }
          ]
        }
      ]
    })

    const { responseApi } = getOpenAIClient('KEY')
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await responseApi([], { prompt: 'custom prompt' })

    expect(mockResponse).toHaveBeenCalled()
    const callArgs = mockResponse.mock.calls[0][0]
    expect(callArgs.input.some((item: any) => item.content === 'custom prompt')).toBe(true)

    consoleSpy.mockRestore()
  })

  test('Should use default model when model not provided', async () => {
    mockResponse.mockResolvedValueOnce({
      status: 'success',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                items: [{ type: 'text', content: 'response' }]
              })
            }
          ]
        }
      ]
    })

    const { responseApi } = getOpenAIClient('KEY')

    await responseApi([])

    expect(mockResponse).toHaveBeenCalled()
    const callArgs = mockResponse.mock.calls[0][0]
    expect(callArgs.model).toBeDefined()
  })

  test('Should use custom model when provided', async () => {
    mockResponse.mockResolvedValueOnce({
      status: 'success',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                items: [{ type: 'text', content: 'response' }]
              })
            }
          ]
        }
      ]
    })

    const { responseApi } = getOpenAIClient('KEY')

    await responseApi([], { model: 'gpt-4.1-mini' })

    expect(mockResponse).toHaveBeenCalled()
    const callArgs = mockResponse.mock.calls[0][0]
    expect(callArgs.model).toBe('gpt-4.1-mini')
  })

  test('Should handle empty messages array', async () => {
    mockResponse.mockResolvedValueOnce({
      status: 'success',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                items: [{ type: 'text', content: 'response' }]
              })
            }
          ]
        }
      ]
    })

    const { responseApi } = getOpenAIClient('KEY')

    const response = await responseApi([])

    expect(response).toBeDefined()
  })

  test('Should handle image generation output', async () => {
    mockResponse.mockResolvedValueOnce({
      status: 'success',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                items: [{ type: 'text', content: 'response' }]
              })
            }
          ]
        },
        {
          type: 'image_generation_call',
          result: 'base64_image_data'
        }
      ]
    })

    const { responseApi } = getOpenAIClient('KEY')

    const response = await responseApi([])

    expect(response).toContainEqual({
      type: 'image',
      content: 'base64_image_data'
    })
  })

  test('Should handle message without output_text', async () => {
    mockResponse.mockResolvedValueOnce({
      status: 'success',
      output: [
        {
          type: 'message',
          content: []
        }
      ]
    })

    const { responseApi } = getOpenAIClient('KEY')

    const response = await responseApi([])

    expect(response).toEqual([])
  })

  test('Should handle hasEnoughCoins option', async () => {
    mockResponse.mockResolvedValueOnce({
      status: 'success',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                items: [{ type: 'text', content: 'response' }]
              })
            }
          ]
        }
      ]
    })

    const { responseApi } = getOpenAIClient('KEY')

    await responseApi([], { hasEnoughCoins: true })

    expect(mockResponse).toHaveBeenCalled()
  })
})
