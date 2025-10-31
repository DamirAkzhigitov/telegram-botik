import { describe, it, expect } from 'vitest'
import commands from '../../src/commands'
import { help } from '../../src/commands/help'
import { resetSticker } from '../../src/commands/resetSticker'
import { addSticker } from '../../src/commands/addSticker'
import { clearMessage } from '../../src/commands/clearMessage'
import { showMemories } from '../../src/commands/showMemories'
import { clearMemories } from '../../src/commands/clearMemories'
import { configureChatSettings } from '../../src/commands/chatSettings'
import { setNewPrompt } from '../../src/commands/setNewPrompt'
import { getPrompt } from '../../src/commands/getPrompt'
import { useHistory } from '../../src/commands/useHistory'
import { setModel } from '../../src/commands/setModel'

describe('commands/index', () => {
  it('should export an array of command functions', () => {
    expect(Array.isArray(commands)).toBe(true)
    expect(commands.length).toBeGreaterThan(0)
  })

  it('should include all expected commands', () => {
    const commandFunctions = [
      help,
      setNewPrompt,
      resetSticker,
      addSticker,
      getPrompt,
      setModel,
      useHistory,
      clearMessage,
      showMemories,
      clearMemories,
      configureChatSettings
    ]

    expect(commands).toHaveLength(commandFunctions.length)
    
    // Check that all commands are present
    commandFunctions.forEach((cmd) => {
      expect(commands).toContain(cmd)
    })
  })

  it('should export commands in the correct order', () => {
    expect(commands[0]).toBe(help)
    expect(commands[1]).toBe(setNewPrompt)
    expect(commands[2]).toBe(resetSticker)
    expect(commands[3]).toBe(addSticker)
    expect(commands[4]).toBe(getPrompt)
    expect(commands[5]).toBe(setModel)
    expect(commands[6]).toBe(useHistory)
    expect(commands[7]).toBe(clearMessage)
    expect(commands[8]).toBe(showMemories)
    expect(commands[9]).toBe(clearMemories)
    expect(commands[10]).toBe(configureChatSettings)
  })

  it('should export all commands as functions', () => {
    commands.forEach((command) => {
      expect(typeof command).toBe('function')
    })
  })
})

