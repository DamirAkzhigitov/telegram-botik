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
})
