import { help } from './help'
import { resetSticker } from './resetSticker'
import { addSticker } from './addSticker'
import { clearMessage } from './clearMessage'
import { showMemories } from './showMemories'
import { clearMemories } from './clearMemories'
import { configureChatSettings } from './chatSettings'
import { setNewPrompt } from './setNewPrompt'
import { getPrompt } from './getPrompt'
import { useHistory } from './useHistory'
import { setModel } from './setModel'

export default [
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
