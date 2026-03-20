declare namespace Cloudflare {
  interface Env {
    XAI_API_KEY?: string
    /** JSON `User` from getMe — skips live getMe on first update (Vitest / local harness). */
    TELEGRAM_BOT_INFO_JSON?: string
    /** Base URL for Bot API (default https://api.telegram.org). Set to a local stub in e2e tests. */
    TELEGRAM_API_ROOT?: string
  }
}
