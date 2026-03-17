import { AdminAuthService } from '../service/AdminAuthService'

export interface AuthenticatedRequest extends Request {
  userId?: number
  adminAuthService?: AdminAuthService
}

/**
 * Check if request is from localhost (for dev bypass only).
 * With wrangler dev --remote, request.url may point to Cloudflare, so we also
 * check Host, Origin, Referer, and X-Forwarded-Host headers.
 */
function isLocalhost(request: Request): boolean {
  const url = new URL(request.url)
  const urlHost = url.hostname
  const hostHeader = request.headers.get('Host')?.split(':')[0] ?? ''
  const origin = request.headers.get('Origin') ?? ''
  const referer = request.headers.get('Referer') ?? ''
  const forwardedHost = request.headers.get('X-Forwarded-Host') ?? ''

  const localhostIndicators = [urlHost, hostHeader, origin, referer, forwardedHost]
  return localhostIndicators.some(
    (h) =>
      h?.includes('localhost') ||
      h?.includes('127.0.0.1')
  )
}

/**
 * Middleware to authenticate requests using Telegram Web App initData.
 * When ?dev=1 and request is from localhost, bypasses auth for debugging.
 */
export async function authenticateRequest(
  request: Request,
  env: Env
): Promise<{ userId: number; adminAuthService: AdminAuthService } | null> {
  const url = new URL(request.url)

  const devBypass =
    url.searchParams.get('dev') === '1' &&
    (isLocalhost(request) || (env as { DEV_BYPASS?: string }).DEV_BYPASS === '1')

  if (devBypass) {
    return {
      userId: 0,
      adminAuthService: new AdminAuthService(env, env.BOT_TOKEN)
    }
  }

  const initData =
    url.searchParams.get('_auth') || url.searchParams.get('initData')

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
