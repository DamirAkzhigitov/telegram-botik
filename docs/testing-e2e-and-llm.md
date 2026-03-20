# E2E and LLM testing — current state and next steps

This document describes how the project tests the Telegram → Worker → LLM pipeline today, what is missing for “proper” end-to-end coverage, and how to add **LLM-focused** tests without relying on live API calls in every CI run.

---

## 1. Current state (inventory)

### 1.1 Unit and integration tests

- **Vitest** (`vitest.config.mts`) runs the full suite with `pnpm test`. There is no separate worker-only pool in config today; `@cloudflare/vitest-pool-workers` is listed in `package.json` but not wired into `vitest.config.mts` (optional upgrade for closer-to-Workers runtime fidelity).
- **`test/e2e/webhook-message.test.ts`** — described in-file as “e2e style”: `worker.fetch` receives a JSON Telegram update, **`createBot` runs the real Telegraf pipeline**, outbound Telegram HTTP goes to a **local stub** (`http.createServer`), and **KV / D1 / embeddings / LLM are mocked** (`vi.mock` on `src/gpt`, `EmbeddingService`, etc.). This validates the **wiring** from webhook POST → bot → `sendMessage`, not the real OpenAI or Pinecone behavior.
- **`test/bot.test.ts`** (suite name: `BotService`) — **unit tests for `getOpenAIClient` / `responseApi`** in `src/gpt.ts` by mocking `openai`’s `responses.create`. Covers happy path, incomplete status, exceptions, custom prompt/model, image output, empty output, `moodText`, etc.
- **`test/bot/messageHandler.test.ts`** — heavy use of a **mock `responseApi`** to test routing, gating, session behavior without calling OpenAI.

So: **pipeline integration** is partially covered; **real LLM** is always mocked outside `bot.test.ts`’s controlled `responses.create` mock.

### 1.2 Scripts

| Command         | Role                                                             |
| --------------- | ---------------------------------------------------------------- |
| `pnpm test`     | Full Vitest run (includes `test/e2e`).                           |
| `pnpm test:e2e` | Only `test/e2e/**`.                                              |
| `pnpm validate` | format + typecheck + lint + **full** `pnpm test` (e2e included). |

---

## 2. What “proper” testing usually means here

| Layer                          | Goal                                                                       | Live APIs?                                                             |
| ------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Unit (LLM adapter)**         | `responseApi` builds correct `input`, parses `output`, handles errors.     | No — mock `responses.create` (current approach in `test/bot.test.ts`). |
| **Contract / snapshot**        | Prompt assembly (developer blocks, schema) stays stable when refactoring.  | No — assert on `mockResponse.mock.calls[0][0]` or snapshot `input`.    |
| **Integration (worker + bot)** | Webhook POST → correct Telegram API calls and side effects (KV, DB mocks). | No for CI — same pattern as `webhook-message.test.ts`.                 |
| **E2E (staging)**              | Real Telegram + real tunnel + real Worker + real or test OpenAI key.       | Yes — manual or scheduled; not every PR.                               |
| **Eval / quality**             | Model behavior against golden questions or rubrics.                        | Yes — optional job with budget caps.                                   |

“Proper E2E” in production systems often means **tier 4** (real external deps). The repo already has a strong **tier 3** pattern; gaps are **breadth of scenarios**, **prompt/schema contracts**, and optional **live smoke / eval**.

---

## 3. Gaps to address

### 3.1 E2E-style integration (`test/e2e`)

- Only **one** scenario (private text message → reply). Missing examples: **commands** (`/start`, `/help`, …), **media**, **group vs supergroup**, **thread reply**, **error paths** (e.g. `sendMessage` failure), **admin API routes** if they should be covered together.
- **Stub** only implements `getMe` and `sendMessage`; other Bot API methods used by the bot would return generic `ok: true` — may hide bugs if code paths call more endpoints.
- No **deterministic assertions** on full outbound payload (entities, parse mode, reply parameters) beyond finding a substring.

### 3.2 LLM unit tests

- Logic lives in **`src/gpt.ts`** but tests live under **`test/bot.test.ts`** — easy to miss; consider **`test/gpt.test.ts`** (move or re-export) for discoverability.
- **JSON schema** in `responses.create` is duplicated as a large inline object — changes risk drift; tests could assert **required keys** / **enum values** for `items[].type` or extract schema to a shared constant tested once.
- **Edge cases** worth adding when product needs them: malformed JSON in `output_text`, `items` missing, multiple `message` outputs, only `image_generation_call` without text, whitespace-only `moodText` (should not inject, if that’s desired).

### 3.3 No live / eval tests

- Nothing in-repo documents a **manual** or **CI nightly** run against real OpenAI with a restricted key and spend limits.

---

## 4. Recommended approach (phased)

### Phase A — Quick wins (no new infrastructure)

1. **Rename or split tests**

   - Add `test/gpt.test.ts` containing the `getOpenAIClient` tests (move from `bot.test.ts` or `import` the same suite) so `gpt` coverage is obvious in file listing.

2. **Expand `test/e2e/webhook-message.test.ts` (or add files)**

   - Add at least: one **command** update, one **reply_to_message** / thread shape if the bot uses it, and one path that **does not** call the LLM (if such a path exists) to ensure mocks stay accurate.
   - Extend the Telegram stub to capture **`editMessageText`**, **`sendChatAction`**, etc., if the production bot uses them (grep `telegram` / `ctx.telegram` usage).

3. **Snapshot or contract assertions on LLM request**

   - For one or two tests in `gpt` tests: `expect(callArgs.input).toMatchSnapshot()` or assert the **order** of developer messages (formatting → prompt/mind → mood → user). Reduces accidental prompt regressions.

4. **Document manual E2E**
   - Short subsection in `AGENTS.md` or this doc: `pnpm dev` + `pnpm serve` + `webhook:set-dev`, send messages in Telegram, what to verify. Links to existing `scripts/README.md` tunnel flow.

### Phase B — Stronger integration tests (still no live LLM in CI)

5. **Shared test helpers**

   - Extract `createMemoryKv`, `createUserDbMock`, `startTelegramApiStub` into `test/helpers/` to avoid duplication when adding e2e cases.

6. **Fakes with behavior**

   - Replace broad `vi.fn()` KV with a minimal in-memory implementation that enforces key shapes (e.g. session JSON schema) so bad writes fail tests.

7. **Optional: Wire `@cloudflare/vitest-pool-workers`**
   - Follow [Cloudflare’s Vitest pool docs](https://developers.cloudflare.com/workers/testing/vitest-integration/) so integration tests run in the Workers runtime when needed. Use for tests that rely on `Request`/`Response` edge cases or D1 bindings if mocks become insufficient.

### Phase C — Live and quality (optional, cost-controlled)

8. **Smoke script**

   - `scripts/smoke-openai.ts` or a Vitest file gated by `process.env.OPENAI_SMOKE=1`: one `responses.create` with minimal tokens, run locally or on a protected branch. Enforce **max tokens** and **single call** in script.

9. **Eval harness (later)**

   - Small set of fixed user messages + assertions on structure (JSON types, max length) or lightweight scoring; run weekly, not on every push. Consider OpenAI evals or a simple CSV-driven script.

10. **True Telegram E2E (rare)**
    - [Telegram Test Environment](https://core.telegram.org/bots/webhooks#testing-your-bot) or a dedicated test bot + secret in CI: only if you need to validate **Telegram-specific** behavior that stubs cannot model.

---

## 5. CI checklist (suggested)

| Step              | Command                                        | Notes                                                                 |
| ----------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| Default PR        | `pnpm validate`                                | Keeps current behavior; already includes e2e folder via `vitest run`. |
| Optional stricter | `pnpm test:e2e` explicitly in a dedicated job  | Same as subset; useful if you later split “fast” vs “slow” suites.    |
| Nightly           | `OPENAI_SMOKE=1 pnpm test` or dedicated script | Only with org secrets and budget alerts.                              |

---

## 6. Summary

| Area                            | Today                                     | Direction                                                               |
| ------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| **Worker → Bot → Telegram**     | One e2e-style test with HTTP stub + mocks | More scenarios; richer stub; shared helpers                             |
| **LLM adapter (`gpt.ts`)**      | Solid mocked tests in `test/bot.test.ts`  | Align file naming; add snapshot/contract tests; optional schema extract |
| **Real OpenAI / real Telegram** | Not automated in repo                     | Manual doc + optional gated smoke/eval                                  |

Implementing **Phase A** gives the best return: clearer LLM tests, broader webhook integration coverage, and documented manual verification, without new services or API spend.

---

## 7. Live E2E: real Telegram + real LLM (no mocks)

This section answers: _what if we skip mocks and hit Telegram and the LLM for real, so a run proves the full stack after changes?_

### 7.1 What you gain

| Confirmed                                                           | Not guaranteed by this alone                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Worker deploy, env secrets (`API_KEY`, `BOT_TOKEN`, KV/D1 bindings) | Same behavior under load or rare race conditions                     |
| Telegraf + webhook path + outbound `sendMessage` to Telegram        | Every code branch (commands, groups, media) unless you exercise them |
| OpenAI `responses.create`, schema, parsing in `gpt.ts`              | Model quality or deterministic wording                               |
| Pinecone / embeddings (if used on that path)                        | Cost control if someone spams the test bot                           |

So **live E2E is an integration smoke test**, not a replacement for unit tests. Use it **after** deploy or before a release, not as the only gate on every commit.

### 7.2 Trade-offs (why CI usually still mocks)

- **Cost** — every run bills OpenAI (and possibly Pinecone). A bad loop can burn budget.
- **Flakiness** — rate limits, Telegram 429/5xx, cold starts, model timeouts.
- **Secrets** — `BOT_TOKEN` and `API_KEY` must live in CI or a human’s machine; leakage risk if logs print updates.
- **Speed** — seconds to tens of seconds per case vs milliseconds for Vitest.
- **Inbound automation** — Telegram’s Bot API lets the **bot** send messages easily; simulating a **user** message to your bot without mocks usually means a **real user account** (app or MTProto client), not only `curl` to `api.telegram.org`.

Because of that, teams often use **one dedicated test bot** + **manual or scheduled** live checks, and keep **mocked** tests on every PR.

### 7.3 Recommended setup (one test bot, staging-like worker)

1. **Create a separate Telegram bot** (e.g. `@YourBotE2E_bot`) — never use production token in automation.
2. **Restrict who can talk to it** — implement or use existing admin / allowlist logic so random users cannot trigger LLM spend (your codebase has session/admin patterns; align the test bot’s access with that).
3. **Point webhook at the environment under test**
   - **Preview Worker URL** after `pnpm deploy`, or
   - **Dev tunnel**: `pnpm dev` + `pnpm serve`, set `DEV_WEBHOOK_URL`, then `pnpm webhook:set-dev` (see `scripts/README.md`).
4. **Configure real secrets** in that environment (`wrangler secret`, Cloudflare dashboard) — same shape as production: `API_KEY`, `BOT_TOKEN`, KV, D1, etc.
5. **Manual smoke (simplest, fully “no mocks”)**
   - Open Telegram, send a short message to the test bot.
   - Expect a coherent reply within a few seconds.
   - Optionally run a **command** you care about (`/help`, etc.) and a **second** message to touch memory/history if those paths matter.

Keep a **short checklist** in the team wiki or next to release notes (message text ideas, expected “something came back”, not exact wording).

### 7.4 Stronger checks without rebuilding mocks

- **Observe Worker logs** in Wrangler/dashboard while sending the message — confirms the request hit **your** worker and where failures occur (Telegram vs OpenAI vs DB).
- **Telegram Bot API** after the fact: `getUpdates` or [getWebhookInfo](https://core.telegram.org/bots/api#getwebhookinfo) to see pending errors (not for asserting reply text, but for delivery issues).

### 7.5 Automating “as much as possible” (optional)

Full automation of **user → bot → reply** through the **real** Telegram cloud usually requires one of:

- **Human-in-the-loop** — e.g. release checklist, or Slack reminder to run the manual smoke.
- **User account automation** (MTProto / TDLib / third-party) — powerful but heavy operationally and often against ToS if misused; rarely worth it for a small bot.
- **Gated script that only talks to OpenAI** — confirms API key and `responses.create` shape; does **not** prove Telegram delivery (see Phase C in §4).

A **pragmatic middle ground**: deploy preview → **manual** Telegram message → pass/fail. Automate **billing alerts** and **webhook error** monitoring in production instead of duplicating Telegram in CI.

### 7.6 If you still want CI to run “live”

- Use a **scheduled workflow** (e.g. nightly), not every PR.
- Store `BOT_TOKEN`, `API_KEY`, and **chat id** in GitHub Actions secrets; use a **minimal** script: e.g. `sendMessage` from the bot to a known private chat for “worker alive”, and accept that **LLM round-trip from user message** may stay manual unless you invest in user-side automation.
- Set **OpenAI org budget limits** and **rate limits**; monitor [usage dashboards](https://platform.openai.com/usage).

**Bottom line:** Using **real Telegram + real LLM** for selected test cases is a good **post-change smoke** and release gate; pairing it with **existing mocked unit/integration tests** keeps PR feedback fast and cheap while live runs catch wiring and credential issues mocks cannot see.
