import { authenticateRequest } from './auth'
import { SessionController } from '../service/SessionController'
import type { ChatSettings, Memory, SessionData } from '../types'

interface SessionSummary {
  chatId: string
  chatTitle?: string
  model?: string
  promptPreview: string
  stickerPacksCount: number
  memoriesCount: number
  userMessagesCount: number
  toggleHistory: boolean
}

/**
 * GET /api/sessions - List all sessions for chats where user is admin
 */
export async function getSessions(
  request: Request,
  env: Env
): Promise<Response> {
  const auth = await authenticateRequest(request, env)
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { userId, adminAuthService } = auth

  // Get all chats where user is admin
  const adminChatIds = await adminAuthService.getAdminChats(userId)

  if (adminChatIds.length === 0) {
    return new Response(JSON.stringify({ sessions: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Get session data for each admin chat
  const sessionController = new SessionController(env)
  const sessions: SessionSummary[] = []

  for (const chatId of adminChatIds) {
    try {
      const session = await sessionController.getSession(chatId)
      const chatInfo = await adminAuthService.getChatInfo(chatId)

      sessions.push({
        chatId,
        chatTitle: chatInfo?.title || `Chat ${chatId}`,
        model: session.model,
        promptPreview:
          session.prompt.length > 100
            ? session.prompt.substring(0, 100) + '...'
            : session.prompt,
        stickerPacksCount: session.stickersPacks?.length || 0,
        memoriesCount: session.memories?.length || 0,
        userMessagesCount: session.userMessages?.length || 0,
        toggleHistory: session.toggle_history
      })
    } catch (error) {
      console.error(`Error getting session for chat ${chatId}:`, error)
    }
  }

  return new Response(JSON.stringify({ sessions }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

/**
 * GET /api/sessions/:chatId - Get specific session data
 */
export async function getSession(
  request: Request,
  env: Env,
  chatId: string
): Promise<Response> {
  const auth = await authenticateRequest(request, env)
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { userId, adminAuthService } = auth

  // Verify user is admin of this chat
  const isAdmin = await adminAuthService.verifyAdminStatus(chatId, userId)
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Get session data
  const sessionController = new SessionController(env)
  const session = await sessionController.getSession(chatId)
  const chatInfo = await adminAuthService.getChatInfo(chatId)

  return new Response(
    JSON.stringify({
      chatId,
      chatInfo,
      session
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    }
  )
}

function parseSessionPatch(
  body: unknown
): { ok: true; patch: Partial<SessionData> } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Expected JSON object' }
  }
  const raw = body as Record<string, unknown>
  const patch: Partial<SessionData> = {}

  if ('model' in raw) {
    if (raw.model != null && typeof raw.model !== 'string') {
      return { ok: false, error: 'model must be a string' }
    }
    if (raw.model !== undefined) {
      patch.model = raw.model as SessionData['model']
    }
  }

  if ('prompt' in raw) {
    if (typeof raw.prompt !== 'string') {
      return { ok: false, error: 'prompt must be a string' }
    }
    patch.prompt = raw.prompt
  }

  if ('stickersPacks' in raw) {
    if (!Array.isArray(raw.stickersPacks)) {
      return { ok: false, error: 'stickersPacks must be an array' }
    }
    if (!raw.stickersPacks.every((p) => typeof p === 'string')) {
      return { ok: false, error: 'stickersPacks must be strings' }
    }
    patch.stickersPacks = raw.stickersPacks
  }

  if ('toggle_history' in raw) {
    if (typeof raw.toggle_history !== 'boolean') {
      return { ok: false, error: 'toggle_history must be a boolean' }
    }
    patch.toggle_history = raw.toggle_history
  }

  if ('firstTime' in raw) {
    if (typeof raw.firstTime !== 'boolean') {
      return { ok: false, error: 'firstTime must be a boolean' }
    }
    patch.firstTime = raw.firstTime
  }

  if ('promptNotSet' in raw) {
    if (typeof raw.promptNotSet !== 'boolean') {
      return { ok: false, error: 'promptNotSet must be a boolean' }
    }
    patch.promptNotSet = raw.promptNotSet
  }

  if ('stickerNotSet' in raw) {
    if (typeof raw.stickerNotSet !== 'boolean') {
      return { ok: false, error: 'stickerNotSet must be a boolean' }
    }
    patch.stickerNotSet = raw.stickerNotSet
  }

  if ('chat_settings' in raw) {
    if (
      !raw.chat_settings ||
      typeof raw.chat_settings !== 'object' ||
      Array.isArray(raw.chat_settings)
    ) {
      return { ok: false, error: 'chat_settings must be an object' }
    }
    patch.chat_settings = raw.chat_settings as ChatSettings
  }

  if ('memories' in raw) {
    if (!Array.isArray(raw.memories)) {
      return { ok: false, error: 'memories must be an array' }
    }
    const memories: Memory[] = []
    for (const item of raw.memories) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return { ok: false, error: 'Each memory must be an object' }
      }
      const m = item as Record<string, unknown>
      if (typeof m.content !== 'string') {
        return { ok: false, error: 'Each memory needs a string content' }
      }
      const timestamp =
        typeof m.timestamp === 'string' ? m.timestamp : new Date().toISOString()
      memories.push({ content: m.content, timestamp })
    }
    patch.memories = memories
  }

  if ('userMessages' in raw) {
    if (!Array.isArray(raw.userMessages)) {
      return { ok: false, error: 'userMessages must be an array' }
    }
    patch.userMessages = raw.userMessages as SessionData['userMessages']
  }

  return { ok: true, patch }
}

/**
 * PATCH /api/sessions/:chatId — merge partial session fields (admin only)
 */
export async function patchSession(
  request: Request,
  env: Env,
  chatId: string
): Promise<Response> {
  const auth = await authenticateRequest(request, env)
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { userId, adminAuthService } = auth
  const isAdmin = await adminAuthService.verifyAdminStatus(chatId, userId)
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const parsed = parseSessionPatch(body)
  if (!parsed.ok) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (Object.keys(parsed.patch).length === 0) {
    return new Response(
      JSON.stringify({ error: 'No valid fields to update' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }

  const sessionController = new SessionController(env)
  await sessionController.getSession(chatId)
  await sessionController.updateSession(chatId, parsed.patch)
  const session = await sessionController.getSession(chatId)
  const chatInfo = await adminAuthService.getChatInfo(chatId)

  return new Response(
    JSON.stringify({
      chatId,
      chatInfo,
      session
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    }
  )
}

/**
 * GET /api/admin/chats - List all chats where user has admin rights
 */
export async function getAdminChats(
  request: Request,
  env: Env
): Promise<Response> {
  const auth = await authenticateRequest(request, env)
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { userId, adminAuthService } = auth

  const adminChatIds = await adminAuthService.getAdminChats(userId)

  // Get chat info for each
  const chats = await Promise.all(
    adminChatIds.map(async (chatId) => {
      const chatInfo = await adminAuthService.getChatInfo(chatId)
      return {
        chatId,
        title: chatInfo?.title || `Chat ${chatId}`,
        type: chatInfo?.type
      }
    })
  )

  return new Response(JSON.stringify({ chats }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}
