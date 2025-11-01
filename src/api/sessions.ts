import { authenticateRequest } from './auth'
import { SessionController } from '../service/SessionController'
import type { SessionData } from '../types'

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


