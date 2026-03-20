# Mood system, directed-reply gating & proactive cron — analysis

This document analyzes **three** product directions against the current worker architecture. It maps options, trade-offs, and touch points in this repo.

**Locked product decisions** from stakeholder Q&A are in [§6](#6-locked-product-decisions). Implementation should follow §6; earlier narrative sections stay as background unless they match §6.

**Implementation status (skip if already done):** [§4.1](#41-implementation-status--changelog) records what shipped in code vs what is still open. **Next in sequence:** **§4.2** follow-ups (Mini App surfacing for mood/proactive flags, legacy cleanup). Stage 4 mood v1 is **shipped** — see §4.1.

## Current behavior (baseline)

### Identity & tone

- The model’s “persona” is largely fixed in [`src/gpt.ts`](../src/gpt.ts): `mind` (developer content) plus optional per-chat `sessionData.prompt`, plus `formatting` rules.
- There is **no persisted emotional or situational state** that updates from chat activity. Tone is implied by static instructions (“зеркальное поведение”, сарказм, нижний регистр, etc.), not by a separate **mood** channel.

### Memories

- Long-term facts are stored in `SessionData.memories` and injected via `SessionController.getFormattedMemories()` in [`src/bot/messageHandler.ts`](../src/bot/messageHandler.ts).
- The main model can emit `type: "memory"` items; those are persisted with `addMemory` (capped, e.g. last 50). This is **fact storage**, not mood.

### History

- When `toggle_history` is on, user/assistant turns are kept in `userMessages`, with optional rolling summaries via [`persistConversationHistory`](../src/bot/history.ts) and Pinecone-backed `fetchRelevantSummaries`.
- Recent work persists history even when the bot **does not** run the full reply path (e.g. `shouldReply === false`), so the transcript can grow without a model call.

### When the bot replies today

- **Default (legacy):** [`messageHandler.ts`](../src/bot/messageHandler.ts) uses `reply_only_in_thread` / `thread_id` as before — either every message runs the full reply path, or only messages in the configured forum topic (`/set_tread_id` in [`chatSettings.ts`](../src/commands/chatSettings.ts)).
- **Opt-in directed mode:** when `chat_settings.directed_reply_gating === true`, the handler uses [`addressed.ts`](../src/bot/addressed.ts): private chats always get a reply; in groups, hard signals (command at offset 0, @mention / text_mention, reply-to-this-bot, plain-text name/username) or else a small LLM (`gpt-4.1-mini`); classifier failure or unparseable output → **reply** (fail-open) so transient API issues do not mute the bot. History still appends when `toggle_history` is on; **`[forum_thread_id=N]\n`** is prefixed in stored user lines. Sends use the **trigger message’s** `message_thread_id` via [`responseDispatcher.ts`](../src/bot/responseDispatcher.ts) (`resolveSendExtras`). See [§4.1](#41-implementation-status--changelog).

### Mentions

- `resolveBotAtHandle` + `stripBotAtMentions` ([`constants.ts`](../src/bot/constants.ts)) strip the bot’s current `@username` (from `ctx.botInfo`, else `BOT_USERNAME` / `DEFAULT_BOT_USERNAME`) before the **main** model sees text. Directed gating uses the raw update (entities + text) before that strip where relevant.

### Reactivity only (no proactive jobs)

- The worker is driven by **incoming Telegram updates** (webhook → `handleUpdate` in [`src/index.ts`](../src/index.ts)). There is **no** `scheduled` handler or `triggers.crons` in [`wrangler.jsonc`](../wrangler.jsonc) today.
- The bot **never** starts a turn by itself; outbound traffic is always triggered by a user message (or command) that reached the handler / dispatcher path.

---

## 1. Mood system

### Problem statement

The bot saves **messages** and **memories** but has no explicit **dynamic identity layer**: emotional stance, energy, frustration, warmth, etc. do not systematically track what just happened in the chat.

### Design axes

| Approach                       | Idea                                                                             | Pros                              | Cons                                      |
| ------------------------------ | -------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------- |
| **A. Prompt-only mood**        | Append a short “current mood” paragraph to developer/system content each turn    | Simple, no extra services         | Drift, verbosity, hard to keep consistent |
| **B. Structured mood state**   | Persist fields in `SessionData` (e.g. `mood: { valence, energy, trust, label }`) | Auditable, admin-editable, stable | Needs update rules and decay              |
| **C. Classifier / summarizer** | Small model (or main model) updates mood from last N messages or from diff       | Adapts to real conversation       | Latency, cost, needs guardrails           |
| **D. Event-driven mood**       | Rules + optional LLM: insult → more defensive; praise → slight thaw              | Predictable                       | Brittle without LLM backup                |

### Recommended direction (historical — see §6 for the chosen design)

The team chose **free-text mood in `chat_settings`** (min length, Russian-only, lazy decay, mirrored into memories, updated only when addressed). The hybrid below was the earlier generic proposal:

1. **Structured mood** (scalars/enums) — **not** the chosen path; replaced by long-form text per §6.
2. **Update policy**: small model / heuristics — **superseded**: update mood **when addressed** only (§6).
3. **Injection point**: in [`gpt.ts`](../src/gpt.ts) `responseApi`, after `mind` / `formatting` / `prompt`, inject mood content from `chat_settings` (still applies).
4. **Memories**: product decision is to **mirror mood into `memories`** as well (§6); implementation must append/sync an appropriate memory entry when mood updates.

### Risks

- **Manipulated mood**: users gaming the classifier; mitigate with caps and decay.
- **Cost**: per-message small-model calls add up; batch or throttle (e.g. update mood every 3 messages or only when `should_generate_reply` is true).
- **Consistency**: mood text in Russian vs English; align with existing `mind` language.

### Code touch points

- [`src/types.ts`](../src/types.ts) — `SessionData` / new sub-object.
- [`src/service/SessionController.ts`](../src/service/SessionController.ts) — defaults, migration for old sessions.
- [`src/gpt.ts`](../src/gpt.ts) — inject mood into `input`.
- Optional: admin PATCH already supports partial session updates ([`src/api/sessions.ts`](../src/api/sessions.ts)) — expose mood for debugging.

---

## 2. Topics: read everywhere, reply only when addressed

### Problem statement

In forum (supergroup) chats, the bot should:

- **Ingest** messages from **all** topics (for history / context / mood / future retrieval).
- **Generate and send** a reply only when the message is **meant for the bot** (e.g. @mention, reply to bot’s message, explicit command) or when policy says otherwise.

Today, the inverse is common: `reply_only_in_thread` limits **which messages enter the reply path**, but there is still a single `send_message_option.message_thread_id`, so “answer in the topic where the user wrote” is not the default.

### Telegram signals (useful for gating)

- **Text mention**: `@username` of the bot (compare to `ctx.botInfo.username` or `env.BOT_USERNAME`).
- **Reply chain**: `message.reply_to_message?.from?.is_bot` and whether it’s _this_ bot.
- **Commands**: `entities` type `bot_command` at start of message.
- **Forum**: `message_thread_id` — for replies, usually set `message_thread_id` to the **incoming** message’s thread (General can be `undefined` / 1 depending on API; test in your environment).

Optional weaker signals:

- Contains bot’s display name (fuzzy, error-prone).
- DM vs group (in DMs, “always addressed” is often acceptable).

### Classifier with a small model

When heuristics are ambiguous (group chat, no mention, no reply-to-bot), a **lightweight** completion can classify:

- Input: last user text (and optionally 1–2 previous lines), bot username, language hint.
- Output (strict JSON): `{ "addressed": boolean, "confidence": number, "reason"?: string }`

**When to call**

- Only if heuristics returned “unclear” — saves cost.
- **§6 locked**: there is **no** special “bot topic” bypass; gating is always mention / reply / name / DM / small LLM.

**Model choice**

- Same provider as main (`gpt-5-mini`, `gpt-4.1-mini`, etc.) or a dedicated small endpoint; keep **max tokens** tiny and **temperature** low.

**Failure mode (locked)**

- On classifier timeout / error: **no reply** (do not fall back to heuristics).

### Policy (locked — no legacy modes)

- **Do not keep** the old multi-mode matrix (`legacy` / `forum_topic_bot_only`). Ship **one** modern behavior: ingest from all relevant contexts, reply only per addressing rules below, reply in the **same** `message_thread_id` as the triggering message when in a forum.
- **Addressing rules**
  - **@mention** of the bot → **always** treat as addressed.
  - **Reply** to the bot’s message → **always** treat as addressed.
  - **Bot display name** in plain text (not only `@username`) → **counts** as a signal for “addressed” (implement robust matching against `getMe()` / configured name).
  - **Private (DM) chats** → **always** treated as addressed.
  - **All other cases in groups** → **small LLM** decides `addressed` vs not.
- **Reactions** on the bot’s messages → **do not** count as addressed.
- **Supergroups without forum topics**: same stack as above (mention / reply / name / commands as hard signals where applicable, else small LLM).

### History & storage implications (locked)

- Use the existing **`userMessages`** stream (single session per `chatId`); tag or prefix content with **thread metadata** so the model sees where each turn happened (not separate KV keys per thread).

### Code touch points

- [`src/bot/messageHandler.ts`](../src/bot/messageHandler.ts) — split pipeline:
  1. Always (if `toggle_history`): append sanitized message to history, possibly with thread metadata.
  2. Compute `addressed` (heuristics + optional classifier).
  3. If `!addressed`, return after persistence (no `responseApi`, no coin check).
  4. If `addressed`, merge `send_message_option` with **dynamic** `message_thread_id` from `ctx.message` when in forum mode.
- [`src/bot/responseDispatcher.ts`](../src/bot/responseDispatcher.ts) — each send uses the **trigger** message’s `message_thread_id`, not a single fixed topic from settings (remove reliance on `/set_tread_id`–style fixed thread for replies unless temporarily needed during migration).
- [`src/commands/chatSettings.ts`](../src/commands/chatSettings.ts) — replace fixed-thread UX with new settings model; **no legacy** code paths.

### Cost & latency

- Heuristics: negligible.
- Small classifier: 1 cheap call per “unclear” message; cache bot `@username` from `ctx.telegram.getMe()`.
- Main model: only when addressed — **large savings** in busy groups.

---

## 3. Scheduled proactive conversations (“revive old topics”)

### Problem statement

Today the bot only **reacts** to webhooks. The product goal is a **cron-driven** path that can **open a new turn** where conversation went quiet: **forum topic**, **non-forum group**, or **DM** (see §6 Q21).

In **forums**, this intersects **per-thread history** (section 2): one flat `userMessages` stream still needs “which thread to post in?” and per-thread staleness; in **DMs** / **non-forum groups**, treat the chat as a single activity stream (no `message_thread_id` on send).

### What “stale topic” means (define operationally)

| Signal                                | Data source                                 | Notes                                            |
| ------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| **Time since last message in thread** | Per-`message_thread_id` activity timestamps | Requires tracking not currently in `SessionData` |
| **Semantic “theme” went quiet**       | Embeddings / Pinecone summaries + LLM pick  | Richer, costlier                                 |
| **Explicit thread allowlist**         | `chat_settings.proactive_threads[]`         | Simple, admin-controlled                         |
| **Last bot participation in thread**  | Your own sends log                          | Avoids nagging threads the bot never joined      |

Recommendation (see §6): **time-based staleness per thread** + **Mini App opt-in** + **threads that had activity** (no fixed allowlist for v1); add semantic “topic revival” later.

### Cloudflare Workers mechanics

- Add **`triggers.crons`** in Wrangler — **product: every 3 hours** (see §6); mind [cron limits](https://developers.cloudflare.com/workers/configuration/cron-triggers/) and cold starts.
- Export a **`scheduled`** handler alongside `fetch` in the worker entry (see `ExportedHandler` / `scheduled` in generated types). The cron invocation has **no `Context`** — you must call **Telegram Bot API** directly (`fetch` to `api.telegram.org` or a small `TelegramClient` helper) with `BOT_TOKEN`.
- **CPU time**: scanning many chats per tick can hit limits; use **pagination**, **caps per run** (e.g. max N proactive messages global + per chat), and **KV/D1 cursor** to resume next run.

### High-level algorithm (aligned with §6)

1. **Enumerate candidates**: chats with `chat_settings.proactive_enabled` (**default off**), toggled via **Mini App** (see §6 gaps for personal chats).
2. **Per chat**, maintain **`thread_activity`** for **threads that had activity** (not a static allowlist of ids).
3. **Stale rule (locked)**: **time since last message in that thread** crosses threshold (tune in implementation).
4. **Ambiguous last message**: use a **small model** to decide edge cases (e.g. last line looks like a question to another human) — **not** left to a single hard boolean without LLM.
5. **Generate**: **small model first**; if quality check fails, **escalate to main model** (two-step).
6. **Send**: `sendMessage` with `chat_id` + `message_thread_id`.
7. **Pending reply gate (locked)**: **no global daily cap**, but if the bot already sent a **proactive** message and **nobody has replied** to it yet, **do not** send another proactive in that **thread or chat** on subsequent cron ticks — wait until there is human activity (define “reply” as a new user message after the proactive, or activity reset).
8. **After send**: proactive turn **updates thread activity, mood, and classifier-relevant context** the same as a normal bot message (“update everything”).

### Product / safety guardrails

- **Opt-in**: **Mini App only**, default **off**.
- **Rate limits**: Telegram [limits](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this); stagger sends across cron ticks.
- **Cron schedule (locked)**: **every 3 hours** (`triggers.crons` expression TBD to match UTC slots).
- **Failure handling (locked)**: on send/API failure, **retry on a later cron** only (no permanent disable in spec — implement sensible retry without spamming).

### Relation to other doc sections

- **Directed gating (§2)**: proactive path is separate from “addressed” but **feeds the same** mood / memory / activity state (§6).
- **Mood (§1)**: include current mood text from `chat_settings` in revival generation.
- **Memories (locked)**: **allow** memory writes from proactive generations when the model emits them.

### Code touch points (new / extended)

| Piece                                          | Purpose                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `wrangler.jsonc`                               | `triggers.crons`                                                                                     |
| `src/index.ts` (or `src/scheduled.ts`)         | `export default { fetch, scheduled }`                                                                |
| `src/types.ts` / `SessionController`           | `proactive_enabled`, thresholds, `thread_activity`, cooldown fields                                  |
| `src/bot/messageHandler.ts`                    | On each message, update `thread_activity` / last-seen (per topic in forums, single bucket otherwise) |
| New module e.g. `src/cron/proactiveRevival.ts` | Candidate selection, LLM call, `sendMessage`                                                         |
| D1 (optional)                                  | Queue or audit log of proactive sends                                                                |

### Cost model

- **Cron tick**: O(opted-in chats × active threads) — still bound by Worker CPU; use pagination and work caps per tick even though there is **no** product “daily message cap.”
- **LLM**: up to **two** calls per revival (small → optional main).
- **Storage**: `thread_activity`, proactive pending flags, timestamps.

---

## 4. Staged implementation (accepted)

Work is split into **sequential stages**. **Do not start stage _N_+1 until stage _N_ is implemented, reviewed, and its test suite is green** (Vitest in `test/`; add or extend `*.test.ts` for each stage). Manual smoke on a staging bot is recommended before closing a stage when behavior touches Telegram threading or cron.

**Cross-cutting**: use **explicit `chat_settings` flags** so existing chats keep current behavior until opted in.

### 4.1 Implementation status & changelog

Use this subsection to avoid redoing finished work.

| Stage                               | Status               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1** Directed-reply gating         | **Shipped (opt-in)** | Behind `chat_settings.directed_reply_gating` (default `false`). Legacy path unchanged when flag is off.                                                                                                                                                                                                                                                                                                                                                |
| **1b** Memory without reply (§6 #9) | **Shipped**          | Observer: `gpt-4.1-mini` `chat.completions` JSON `{"memories":[]}`. Runs when `!shouldReply` and `toggle_history` (after history persist). No coin check.                                                                                                                                                                                                                                                                                              |
| **2** `thread_activity`             | **Shipped**          | `SessionData.thread_activity`, `touchThreadActivity` + `resolveThreadActivityKey`; handler touches after `getSession`. Key `__default` for private/groups; supergroup + `message_thread_id` → decimal string (matches history `[forum_thread_id=N]`).                                                                                                                                                                                                  |
| **3** Proactive cron                | **Shipped**          | `triggers.crons` `0 */3 * * *` (UTC); `scheduled` → `runProactiveCronTick`; `chat_settings.proactive_enabled` (default false), `proactive_stale_hours` (default 48); KV list cursor `cron_proactive_list_cursor`; pending gate `proactive_pending`; `is_forum_supergroup` cache; module `src/cron/proactiveRevival.ts`; tests `test/cron/proactiveRevival.test.ts`, scheduled in `test/index.test.ts`.                                                 |
| **4** Mood v1                       | **Shipped**          | `chat_settings.mood_text` / `mood_updated_at`; admin `PATCH` validation (≥150 chars, Russian); `responseApi` injects mood in [`gpt.ts`](../src/gpt.ts); `updateMoodAfterAddressedTurn` ([`mood.ts`](../src/bot/mood.ts)) after each addressed reply + after proactive send; memory mirror `Настроение: …`; tests [`mood.test.ts`](../test/bot/mood.test.ts), [`sessions.test.ts`](../test/api/sessions.test.ts), [`bot.test.ts`](../test/bot.test.ts). |

**Stage 1 — what was implemented (March 2026)**

- **Flag:** `directed_reply_gating` on [`ChatSettings`](../src/types.ts); default in [`SessionController`](../src/service/SessionController.ts). Enable with admin `PATCH /api/sessions/:chatId` and `{ "chat_settings": { "directed_reply_gating": true } }`. **`updateSession` deep-merges `chat_settings`** so partial PATCHes do not wipe `thread_id` / `send_message_option`.
- **Module:** [`src/bot/addressed.ts`](../src/bot/addressed.ts) — `hasHardAddressedSignal`, `resolveShouldReplyDirected`, `classifyWhetherAddressed` (OpenAI **`chat.completions`**, model **`gpt-4.1-mini`**, JSON `{"addressed":boolean}`), **`ctx.botInfo`** for bot identity (Telegraf’s `ctx.me` is a string, not `User`).
- **Handler:** [`src/bot/messageHandler.ts`](../src/bot/messageHandler.ts) branches legacy vs directed `shouldReply`; thread prefix **`[forum_thread_id=N]\n`** on composed history text when directed + topic id present.
- **Sends:** [`src/bot/responseDispatcher.ts`](../src/bot/responseDispatcher.ts) — `resolveSendExtras`, `outboundMessageThreadId` (`number` \| `null` \| `undefined`); typing indicator uses the same extras.
- **History text:** [`src/bot/messageBuilder.ts`](../src/bot/messageBuilder.ts) — optional `historyThreadPrefix` in `composeUserContent`.
- **Tests:** [`test/bot/addressed.test.ts`](../test/bot/addressed.test.ts); `messageHandler` suite `directed_reply_gating` describe in [`test/bot/messageHandler.test.ts`](../test/bot/messageHandler.test.ts); `chat_settings` merge in [`test/service/SessionController.test.ts`](../test/service/SessionController.test.ts).

**Stage 1 — intentionally _not_ removed yet (§6 #7 partial)**

- Legacy **`reply_only_in_thread`**, **`/set_tread_id`**, and fixed `send_message_option.message_thread_id` remain for chats with **`directed_reply_gating: false`**. Product “single modern path” can be a follow-up: migrate chats and delete commands once Mini App / admin defaults are ready.

**Stage 1 — manual follow-up**

- Smoke in a **real** forum supergroup (topic ids, General vs topics, `botInfo` populated under webhook).

**Stage 1b — what was implemented (March 2026)**

- **Module:** [`src/bot/memoryObserver.ts`](../src/bot/memoryObserver.ts) — `extractBackgroundMemories`, `formatRecentHistoryForObserver`, `plainTextFromHistoryMessage`; model **`gpt-4.1-mini`**, JSON memories array; empty latest line → no API call; errors → no memories.
- **Handler:** [`messageHandler`](../src/bot/messageHandler.ts) — on **`!shouldReply`** with **`toggle_history`**, after `persistConversationHistory`, run observer and **`addMemory`** for each returned string (same cap pipeline as main path).
- **Coverage:** directed gating “not addressed”, legacy `reply_only_in_thread` skip — paths where the main `responseApi` does not run (classifier failure now fail-opens to a normal reply).
- **Tests:** [`test/bot/memoryObserver.test.ts`](../test/bot/memoryObserver.test.ts); `messageHandler` expectations + `addMemory` when observer returns facts.

**Stage 2 — what was implemented (March 2026)**

- **Types:** [`ThreadActivityBucket`](../src/types.ts), optional `thread_activity` on `SessionData`.
- **Resolver:** [`src/bot/threadActivity.ts`](../src/bot/threadActivity.ts) — `THREAD_ACTIVITY_DEFAULT_KEY`, `resolveThreadActivityKey`.
- **Persistence:** [`SessionController.touchThreadActivity`](../src/service/SessionController.ts), `getSession` migration, `updateSession` shallow-merge for `thread_activity` map keys.
- **Handler:** [`messageHandler`](../src/bot/messageHandler.ts) touches activity immediately after loading session (all non-bot messages that reach that point).
- **Tests:** [`test/bot/threadActivity.test.ts`](../test/bot/threadActivity.test.ts); SessionController merge/touch; messageHandler expectations for `touchThreadActivity`.

**Stage 3 — what was implemented (March 2026)**

- **Cron:** [`wrangler.jsonc`](../wrangler.jsonc) `triggers.crons` **`0 */3 * * *`** (UTC every three hours); [`src/index.ts`](../src/index.ts) exports **`scheduled`** → [`runProactiveCronTick`](../src/cron/proactiveRevival.ts).
- **Settings:** [`ChatSettings`](../src/types.ts) **`proactive_enabled`** (default false via [`SessionController`](../src/service/SessionController.ts)), **`proactive_stale_hours`** (optional, default 48). Enable via admin `PATCH` `chat_settings` (same as other flags).
- **State:** `SessionData.proactive_pending` (per thread key), `is_forum_supergroup` (set from Telegram when `messageHandler` sees forum supergroup).
- **Pipeline:** KV list pagination with cursor key **`cron_proactive_list_cursor`**; caps per tick (scanned chats / sends); candidate threads from `thread_activity` staleness + no pending; **`gpt-4.1-mini`** classify `revive` + generate Russian line; short/empty → main **`responseApi`**; **`sendMessage`** via `fetch` to Telegram; on success `persistConversationHistory`, memories from model output, **`setProactivePendingKey`**; send failure → no session update (retry next cron).
- **Handler:** [`messageHandler`](../src/bot/messageHandler.ts) **`removeProactivePendingKey`** on each user message (same key as `touchThreadActivity`).
- **Tests:** [`test/cron/proactiveRevival.test.ts`](../test/cron/proactiveRevival.test.ts); scheduled wiring in [`test/index.test.ts`](../test/index.test.ts).
- **Manual smoke:** deploy preview with secrets; confirm Worker **Triggers** show cron; temporarily shorten interval or use **Wrangler `curl` scheduled** / dashboard test; opt-in one chat with `proactive_enabled` + stale `thread_activity`; verify Telegram send and pending gate (no second proactive until a user message).

**Stage 3 — delivered vs spec (closure notes)**

| Area                                                                                          | Status                                                                                                                                  |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Cron every 3h, `scheduled`, direct Telegram `sendMessage`                                     | Done                                                                                                                                    |
| `proactive_enabled` default off, staleness from `thread_activity`, threads with activity only | Done                                                                                                                                    |
| Pending-reply gate (no second proactive until a **user** message in that thread bucket)       | Done — `proactive_pending` + clear on `messageHandler`                                                                                  |
| Small model → optional main, memories on proactive path, retry failed sends on later cron     | Done                                                                                                                                    |
| Mini App toggle for proactive                                                                 | **Not done** — enable via admin `PATCH` only (same gap as other flags; see §5)                                                          |
| `toggle_history`                                                                              | **Required** for cron v1 (no revival run if history off; no transcript for LLM)                                                         |
| Forum `message_thread_id`                                                                     | Uses cached `is_forum_supergroup` + numeric thread key; first send in a forum before any user message may lack cache (edge case)        |
| Throughput                                                                                    | One **stale thread per chat** per cron tick (stagger multi-topic revivals across ticks); global caps on scanned keys and sends per tick |

**Stage 4 — what was implemented (March 2026)**

- **Types / settings:** [`ChatSettings`](../src/types.ts) **`mood_text`**, **`mood_updated_at`**; defaults unchanged in [`SessionController`](../src/service/SessionController.ts).
- **Validation:** [`validateMoodTextForStorage`](../src/bot/mood.ts), [`validateChatSettingsPatchPartial`](../src/bot/mood.ts) from [`PATCH /api/sessions`](../src/api/sessions.ts); clear mood with `mood_text: ""` or `null`.
- **Main model:** [`responseApi`](../src/gpt.ts) optional **`moodText`** → developer block after mind/custom `prompt`; [`messageHandler`](../src/bot/messageHandler.ts) passes [`resolveMoodForInjection`](../src/bot/mood.ts).
- **Refresh:** [`updateMoodAfterAddressedTurn`](../src/bot/mood.ts) (`gpt-4.1-mini`, JSON `mood`) after each **addressed** full reply (after dispatch) and after **proactive** Telegram send ([`proactiveRevival.ts`](../src/cron/proactiveRevival.ts)); lazy decay in system prompt; **mirror** to memories as `Настроение: …` when text changes.
- **Tests:** [`test/bot/mood.test.ts`](../test/bot/mood.test.ts), [`test/api/sessions.test.ts`](../test/api/sessions.test.ts) (PATCH validation), [`test/bot.test.ts`](../test/bot.test.ts) (injection), `messageHandler` mocks updated.

### 4.2 Proposed next steps

**1. Stage 4 — Mood v1** — **done** (§4.1). Optional: Mini App field for `mood_text` instead of admin PATCH only.

**2. Product / UX (cross-cutting)**

- Surface **`proactive_enabled`** (and optionally **`proactive_stale_hours`**) in the Mini App / admin UI without hand-editing JSON — same pattern as §5 for **`directed_reply_gating`**.
- **DMs / private chats:** settings entry point (deep link, command, or Mini App with `chat_id`) so proactive and other flags are not group-admin-only in practice.

**3. Stage 3 hardening (optional, parallel-friendly)**

- **Manual / staging smoke:** real forum topic + DM + `sendMessage` failure (confirm no KV update until next tick).
- **Observability:** structured logs or counters for scans, sends, classifier skip, Telegram errors (no PII).
- **Tests:** optional integration-style test with mocked `fetch` + `getOpenAIClient` if we want end-to-end coverage beyond pure helpers.
- **Product nuance:** document or implement stricter “reply to proactive” semantics (§5) if stakeholders want reply-chain semantics, not only “any user message in thread.”

**4. Legacy cleanup (§6 #7)**  
When ready: migrate chats off **`reply_only_in_thread` / `/set_tread_id`**, default **`directed_reply_gating`**, remove duplicate code paths.

**5. Later (out of current macro-order)**  
Semantic / embedding-based “topic revival,” D1 audit table for proactive sends, separate **quality** small-model pass after draft text, per-chat rate tuning.

---

### Stage 1 — Directed-reply gating & dynamic threading — **DONE (opt-in)**

**Scope** _(original; see §4.1 for delivered subset)_

- Mention / reply-to-bot / bot display name / commands / DM = addressed per §6; groups otherwise → small LLM `addressed` decision.
- Classifier **timeout / error → no reply** (no heuristic fallback).
- **Ingest** relevant messages into the single `userMessages` stream; when `!addressed`, persist what the product requires for history (already partly true today) and **skip** full reply path (`responseApi`, coin check, visible send).
- **Reply in the same** `message_thread_id` as the triggering message in forums; remove **legacy** fixed-thread-only reply modes (`reply_only_in_thread` / `/set_tread_id` style behavior as specified in §2 — one modern path).
- Include **thread metadata in stored history content** where the model needs it (§6 item 6), even if `thread_activity` structs land in Stage 2.

**Exit criteria (stage complete)**

- Behavior matches §2 / §6 directed-reply rules; legacy modes removed or feature-flagged off as agreed.
- Unit / integration tests cover: addressed heuristics, classifier success and failure (no reply), DM always addressed, dynamic `message_thread_id` on send path (via dispatcher / handler tests with mocked `ctx`).

**Background chatter (locked, §6 item 9)** — _either_ ship in Stage 1 _after_ gating tests pass, _or_ treat as **Stage 1b**: memory-oriented extraction when the bot does not send a user-visible reply. If split as 1b, **Stage 2 starts only after 1b is done and tested** (cost choice documented; stub LLM in tests).

---

### Stage 2 — Per-thread activity for cron & history consistency

**Scope**

- **`thread_activity`** (or equivalent) in session state: last activity per forum thread + single bucket for non-forum groups / DMs, updated from **`messageHandler`** on each relevant message.
- Align `userMessages` annotations with the format assumed in Stage 1 so cron and revival logic read a single consistent schema.

**Exit criteria**

- Persistence and updates covered by tests (e.g. forum vs non-forum branches, thread id keying).
- No dependency yet on cron firing; state is correct for a **dry run** or unit-tested “candidate selection” inputs.

---

### Stage 3 — Proactive cron v1 — **DONE**

**Scope**

- `triggers.crons` (every **3 hours**, §6), `scheduled` handler, caps / pagination / cursors as needed.
- Mini App (or agreed UI) toggle: **`proactive_enabled`**, default **off**; staleness = **time since last message in that thread**; **threads that had activity**; pending-reply gate; small model → optional main; failures → retry later cron only; memories allowed on proactive generations (§6).

**Exit criteria**

- Tests for scheduled entry (mocked env), candidate filtering, pending-reply gate, and send/retry policy at the unit level; document any manual cron smoke steps.
- Confirms integration with Stage 2 activity data.

---

### Stage 4 — Mood v1

**Scope**

- Free-text mood under **`chat_settings`**, **≥150 characters**, **Russian**, validation in admin / Mini App; update **only when addressed** (full reply path); **lazy** decay; **mirror** into `memories` on update; inject in [`gpt.ts`](../src/gpt.ts) per §6.

**Exit criteria**

- Tests for validation, persistence, injection wiring (mock `responseApi` input), and memory mirroring when mood updates.

---

### Process rule

| Rule                 | Detail                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Sequential gates** | Merge or deploy Stage _N_ only when its exit criteria and automated tests are satisfied; then begin Stage _N_+1.   |
| **Regressions**      | Extend prior stages’ tests when later stages change shared modules (`messageHandler`, `SessionController`, types). |
| **Locked order**     | Same macro-order as stakeholder sign-off: **1 → 2 → 3 → 4** (§6 item 27).                                          |

**One-line summary**

1. ~~Directed-reply gating + dynamic threading (+ thread metadata in history).~~ **Done (opt-in)** — see §4.1.
2. ~~Per-thread activity metadata for cron.~~ **Done** — see §4.1 Stage 2.
3. ~~Proactive cron v1.~~ **Done** — see §4.1 Stage 3 and §4.2.
4. ~~**Mood v1**~~ — **Shipped** (§4.1).

---

## 5. Remaining gaps & TBD

| Item                                  | Status                                                                                                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Directed gating toggle**            | **`directed_reply_gating`** is admin-PATCH only today; optional bot commands / Mini App surfacing if operators need in-chat UX.                                              |
| **Personal chats vs Mini App**        | Settings UI is **group-oriented** today; **DMs** still need a way to toggle proactive (and other flags) — e.g. commands, deep link, or Mini App context by `chat_id`.        |
| **Proactive toggle UX**               | **`proactive_enabled`** is **admin JSON PATCH** only (Stage 3). Mini App checkbox / copy still TBD — see §4.2.                                                               |
| **Memory without reply**              | **Shipped** (Stage 1b): small-model observer when `toggle_history` and no visible reply.                                                                                     |
| **Mood ≥150 characters**              | **API:** enforced on admin `PATCH` `chat_settings.mood_text`. LLM mood refresh rejects invalid output (no session update). Mini App surfacing still optional.                |
| **“No reply to proactive” detection** | **Implemented (v1):** any **user** message in the same `thread_activity` bucket clears `proactive_pending` for that key. Optional stricter rule (reply chain / time) — §4.2. |

---

## 6. Locked product decisions

Answers from stakeholder questionnaire. Numbers match the original question list.

### Directed reply gating & forum

1. **Reactions** on bot messages → **not** “addressed.”
2. **Groups**: **@mention** → always addressed; **reply to bot** → always addressed; **all other** ambiguous cases → **small LLM** decides.
3. **DMs** → **always** addressed.
4. Classifier **error / timeout** → **no reply** (no heuristic fallback).
5. Bot **display name in plain text** → counts toward addressing (in addition to `@username`).
6. History → keep **single `userMessages` stream** per chat with thread metadata in content (not separate session per thread).
7. **Remove legacy** code paths / old modes — **one** modern implementation.
8. **No** separate “bot topic” where the bot always replies without gating.

### Background chatter & memories

9. **Yes** — run memory-oriented extraction **even when** the bot does **not** send a user-visible reply.

### Mood

10. **Free-text** mood with a **minimum length of 150 characters** (validation required).
11. Stored under **`chat_settings`** (not a separate top-level `SessionData` block unless implementation prefers a mirror field).
12. Update mood **only when** the message is **addressed** (full reply path).
13. **Lazy** decay toward neutral (on next relevant event, not a separate cron unless added later).
14. **Mirror** mood into **`memories`** when it updates.
15. Mood text for the model → **Russian only**.

### Proactive cron

16. **No** fixed daily cap; **if users have not replied** after the last proactive post, **do not** send another proactive in that situation even when cron fires (pending-reply gate).
17. Use **small model** for ambiguous revival decisions (e.g. whether the thread’s last message is “to a human”).
18. Proactive bot message **updates everything**: thread activity, mood, classifier context — same as a normal bot turn for state purposes.
19. Staleness → **time since last message in thread** only (v1).
20. Enable via **Mini App**; **default off**. **DMs and all group kinds** are in scope for proactive (Q21); **Mini App / admin UX** for toggling settings per **private** chat is still the open item in §5 (no group-only restriction in product scope).
21. **All chat kinds** support proactive when opted in: **forum topics** (`message_thread_id`), **groups/supergroups without topics** (single implicit “thread”), and **private (DM) chats**. Implementation must branch on chat type: only set `message_thread_id` when the Telegram chat is a forum and a topic applies.
22. Target **threads that had activity** in forums (dynamic), not a fixed allowlist; for **non-forum groups and DMs**, the whole chat is the single revival target once staleness rules pass.
23. Cron **every 3 hours**.
24. **Small model first**, then **main model** if needed.
25. **Yes** — proactive flows **may** write **memories**.
26. On failure → **retry on a later cron** only (no immediate permanent disable specified).

### Cross-cutting

27. **Accepted** implementation order as in §4.

---

## References in repo

| Area                                 | File                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Reply gating (directed mode)         | `src/bot/addressed.ts`, `src/bot/messageHandler.ts`                                                   |
| Thread / send options                | `src/types.ts`, `src/commands/chatSettings.ts`, `src/bot/responseDispatcher.ts` (`resolveSendExtras`) |
| System persona                       | `src/gpt.ts` (`mind`, `formatting`)                                                                   |
| Memories                             | `src/service/SessionController.ts`, `src/bot/messageBuilder.ts`                                       |
| History persistence                  | `src/bot/history.ts`                                                                                  |
| Worker entry (`fetch` + `scheduled`) | `src/index.ts`, `wrangler.jsonc` (`triggers.crons`)                                                   |
| Proactive cron (Stage 3)             | `src/cron/proactiveRevival.ts`                                                                        |
