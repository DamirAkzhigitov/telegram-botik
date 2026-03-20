import type { Context } from 'telegraf'

/**
 * Single activity bucket for DMs, basic groups, forum General when no topic id is present.
 * Matches proactive-revival spec: one stream for non-forum / private chats.
 */
export const THREAD_ACTIVITY_DEFAULT_KEY = '__default'

/**
 * Resolves the `thread_activity` map key for the current update.
 * Supergroups with `message_thread_id` on the message: decimal string (same id as `[forum_thread_id=N]` in history).
 * Private chats and basic groups: {@link THREAD_ACTIVITY_DEFAULT_KEY}.
 */
export function resolveThreadActivityKey(ctx: Context): string {
  const chat = ctx.chat
  if (!chat) return THREAD_ACTIVITY_DEFAULT_KEY

  if (chat.type === 'private' || chat.type === 'group') {
    return THREAD_ACTIVITY_DEFAULT_KEY
  }

  if (chat.type === 'supergroup') {
    const msg = ctx.message
    if (
      msg &&
      'message_thread_id' in msg &&
      typeof msg.message_thread_id === 'number'
    ) {
      return String(msg.message_thread_id)
    }
  }

  return THREAD_ACTIVITY_DEFAULT_KEY
}
