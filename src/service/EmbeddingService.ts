import { Pinecone } from '@pinecone-database/pinecone'
import OpenAI from 'openai'

export class EmbeddingService {
  env: Env
  pc: Pinecone
  openai: OpenAI

  constructor(env: Env) {
    this.env = env
    this.pc = new Pinecone({
      apiKey: env.PINECONE
    })
    this.openai = new OpenAI({ apiKey: env.API_KEY })
  }

  async saveMessage(chatId: number, role: string, content: string) {
    const index = this.pc.Index('botik')
    const embeddingResponse = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: content,
      dimensions: 512
    })

    const embedding = embeddingResponse.data[0].embedding

    await index.upsert([
      {
        id: `${chatId}-${Date.now()}`,
        values: embedding,
        metadata: {
          chatId,
          role,
          content,
          timestamp: Date.now()
        }
      }
    ])
  }
  async fetchRelevantMessages(chatId: number, query: string, topK = 5) {
    const index = this.pc.Index('botik')
    const embeddingResponse = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      dimensions: 512
    })

    const embedding = embeddingResponse.data[0].embedding

    const results = await index.query({
      vector: embedding,
      topK,
      filter: { chatId: { $eq: chatId } },
      includeMetadata: true
    })

    return results.matches.map((match) => match.metadata)
  }
}
