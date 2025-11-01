import { AdminAuthService } from '../service/AdminAuthService'

export interface AuthenticatedRequest extends Request {
  userId?: number
  adminAuthService?: AdminAuthService
}

/**
 * Middleware to authenticate requests using Telegram Web App initData
 */
export async function authenticateRequest(
  request: Request,
  env: Env
): Promise<{ userId: number; adminAuthService: AdminAuthService } | null> {
  const url = new URL(request.url)
  const initData = url.searchParams.get('_auth') || url.searchParams.get('initData')

  if (!initData) {
    return null
  }

  const adminAuthService = new AdminAuthService(env, env.BOT_TOKEN)
  const user = await adminAuthService.validateInitData(initData)

  if (!user) {
    return null
  }

  return {
    userId: user.id,
    adminAuthService
  }
}


