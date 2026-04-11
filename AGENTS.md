# Repository Guidelines

## Project Structure & Module Organization

Core worker logic stays in `src/`, with `src/index.ts` dispatching requests and `src/bot.ts` wiring Telegraf to OpenAI. Command handlers live under `src/commands/`, shared services under `src/service/`, and cross-cutting helpers in `src/types.ts` and `src/utils.ts`. Use `scripts/` for tunneling, webhook, and deployment automation, and keep specs in `test/`. Platform config is tracked in `wrangler.jsonc`, `runtime.d.ts`, and the D1 schema in `schema.sql`.

## Build, Test, and Development Commands

### Installation

- `pnpm install` – install dependencies in line with the lockfile.

### Development

- `pnpm dev` – run the worker with Wrangler hot reload.
- `pnpm dev:local` – execute `src/local-test.ts` with `.env.local` to mimic Telegram locally.
- `pnpm serve` – start a **Cloudflare quick tunnel** (`cloudflared`) to `localhost:8787`; copy the printed `https://…` URL into `DEV_WEBHOOK_URL` in `.env`, then run `pnpm webhook:set-dev`.

### Testing

- `pnpm test` – run Vitest (add `--watch` when iterating).
- `pnpm test:coverage` – run Vitest with coverage report.
- `pnpm test:e2e` – webhook → Telegraf → message handler pipeline (local Telegram API stub + mocked LLM/embeddings); see `test/e2e/webhook-message.test.ts`.
- **E2E vs LLM testing strategy** (gaps, phases, CI ideas): `docs/testing-e2e-and-llm.md`.
- **LLM provider adapter** (future refactor: ports, env, phases): `docs/llm-provider-adapter.md`.

### Code Quality

- `pnpm format` – apply Prettier formatting before commits.
- `pnpm format:check` – check if files are formatted correctly without modifying them.
- `pnpm typecheck` – run TypeScript type checking without emitting files.
- `pnpm lint` – run ESLint to check code quality.
- `pnpm lint:fix` – run ESLint and automatically fix issues.
- `pnpm validate` – run format, typecheck, lint, and test in sequence.

### Cloudflare Worker

- `pnpm deploy` – deploy to Cloudflare Workers (preview).
- `pnpm cf-typegen` – generate TypeScript types from Wrangler configuration.

### Webhook Management

- `pnpm webhook:set-dev` – set webhook URL for development environment.
- `pnpm webhook:set-prod` – set webhook URL for production environment.
- `pnpm webhook:delete` – delete the current webhook.
- `pnpm webhook:info` – get information about the current webhook.

### Git Hooks

- `pnpm prepare` – set up Husky git hooks (runs automatically after install).

## Coding Style & Naming Conventions

Author strict TypeScript (see `tsconfig.json`) and favor descriptive, imperative function names that mirror Telegram actions. Keep modules ES2022, export commands through the barrel in `src/commands/index.ts`, and default to named exports. Prettier (two-space indent, single quotes) is canonical; avoid manual formatting drift. Use kebab-case for scripts, camelCase for runtime identifiers, and SCREAMING_SNAKE_CASE only for constants sourced from env.

## Testing Guidelines

Place worker or service specs in `test/` named `*.test.ts`. Vitest runs with Cloudflare worker shims, so load secrets through `.env` or per-run overrides. Cover command flows, session persistence, and OpenAI error handling; stub network calls and embeddings when tests would otherwise hit external APIs. New services should ship with unit coverage plus, when feasible, an integration test that drives the command pipeline end to end.

## Commit & Pull Request Guidelines

Follow the existing log: short, imperative subjects (e.g., `turn off image generation`) with optional issue references in parentheses. PRs should include a concise summary, verification steps or commands run, screenshots for user-facing adjustments, and linked issues. Flag any config or secret changes so reviewers can update Wrangler environments before merging.

## Security & Configuration Tips

Store secrets with `wrangler secret put` or in `.env.local`; never commit tokens. Double-check `scripts/setup-webhook.js` and `DEV_WEBHOOK_URL` in `.env` before running `webhook:set-dev`. Remove temporary tunnel URLs when promoting to production and rotate API keys if they were exposed during debugging.

## Cursor Cloud specific instructions

- **Dev server**: Run `npx wrangler dev --local` to start the Cloudflare Worker locally on `http://localhost:8787`. The `--local` flag avoids needing a Cloudflare account. The root `/` and `/health` endpoints return `OK`. The `/admin?dev=1` endpoint serves the admin panel in dev mode (bypasses Telegram auth).
- **All external APIs are mocked in tests**: `pnpm test` requires no API keys, Cloudflare account, or external services. All 453+ tests pass out of the box.
- **Webhook POST without secrets**: Sending a Telegram update POST to `/` will return `400 Invalid request` when `BOT_TOKEN` is not configured — this is expected. The worker initialises the Telegraf bot using `BOT_TOKEN` from the environment, so real webhook handling requires the secret.
- **Pre-commit hook** runs `lint-staged` (ESLint + Prettier). **Pre-push hook** runs `pnpm typecheck`. Both are installed by Husky via `pnpm install`.
- **Node.js 22** is required (see `.nvmrc`). The VM snapshot already has it via nvm.
