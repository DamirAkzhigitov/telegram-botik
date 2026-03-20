import type { User } from 'telegraf/types'

export const IMAGE_PLACEHOLDER_TEXT = '[image omitted - already processed]'
export const TELEGRAM_API_BASE_URL = 'https://api.telegram.org/'

/**
 * Canonical display name — must match the Telegram bot profile (BotFather “name”).
 * Used in prompts and mood updates; do not hardcode other names in copy.
 */
export const BOT_DISPLAY_NAME = 'Виталий'

/** Full name in the main system prompt (first + family). */
export const BOT_PERSONA_FULL_NAME = `${BOT_DISPLAY_NAME} Разумов`

/**
 * Fallback username (no @) when `ctx.botInfo.username` and env `BOT_USERNAME` are unset.
 */
export const DEFAULT_BOT_USERNAME = 'nairbru007bot'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** `@username` for stripping from user text; matches Telegram’s current bot username. */
export function resolveBotAtHandle(
  botInfo: User | undefined,
  env: { BOT_USERNAME?: string }
): string {
  const u = (
    botInfo?.username?.trim() ||
    env.BOT_USERNAME?.trim() ||
    DEFAULT_BOT_USERNAME
  ).replace(/^@/, '')
  return u ? `@${u}` : ''
}

/** Remove bot @-mentions from the raw message (case-insensitive). */
export function stripBotAtMentions(text: string, atHandle: string): string {
  if (!atHandle) return text
  return text.replace(new RegExp(escapeRegExp(atHandle), 'gi'), '')
}
