import { Context } from './types'

export interface BotMind {
  mood: string
  thinking: string
  tasks: string
}

const defaultMind: BotMind = {
  mood: 'хорошее настроение, никто меня не обидел, готов пообщаться',
  thinking: 'пока ни о чем не думаю, но задумаюсь если надо будет',
  tasks: 'пока у меня нету задач, но возможно кто то попросит меня о чем то'
}

export class MindController {
  env: Context

  constructor(env: Context) {
    this.env = env
  }

  // Retrieve the current global bot mind from storage
  async getMind(): Promise<BotMind> {
    const mindJson = await this.env.CHAT_SESSIONS_STORAGE.get('bot_mind')
    if (mindJson) {
      try {
        return JSON.parse(mindJson)
      } catch (e) {
        console.error('Error parsing bot mind JSON:', e)
      }
    }
    // If not set or error occurs, store and return defaultMind
    await this.updateMind(defaultMind)
    return defaultMind
  }

  // Update the global bot mind with partial new values
  async updateMind(newMind: Partial<BotMind>): Promise<void> {
    const currentMind = await this.getMind()
    const updatedMind = { ...currentMind, ...newMind }
    await this.env.CHAT_SESSIONS_STORAGE.put(
      'bot_mind',
      JSON.stringify(updatedMind)
    )
  }
}
