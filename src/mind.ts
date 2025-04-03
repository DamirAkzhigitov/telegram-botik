const defaultMind = `
  настроение: хорошее настроение, никто меня не обидел, готов пообщаться,
  думаю: пока ни о чем не думаю, но задумаюсь если надо будет,
  задачи: пока у меня нету задач, но возможно кто то попросит меня о чем то
`

export class MindController {
  env: Env

  constructor(env: Env) {
    this.env = env
  }

  // Retrieve the current global bot mind from storage
  async getMind(): Promise<string> {
    const mindText = await this.env.CHAT_SESSIONS_STORAGE.get('bot_mind')
    if (mindText) return mindText
    // If not set or error occurs, store and return defaultMind
    await this.updateMind(defaultMind)
    return defaultMind
  }

  // Update the global bot mind with partial new values
  async updateMind(newMind: string): Promise<void> {
    await this.env.CHAT_SESSIONS_STORAGE.put(
      'bot_mind',
      JSON.stringify(newMind)
    )
  }
}
