# Repository Guidelines

## Project Structure & Module Organization

Core worker logic stays in `src/`, with `src/index.ts` dispatching requests and `src/bot.ts` wiring Telegraf to OpenAI. Command handlers live under `src/commands/`, shared services under `src/service/`, and cross-cutting helpers in `src/types.ts` and `src/utils.ts`. Use `scripts/` for tunneling, webhook, and deployment automation, and keep specs in `test/`. Platform config is tracked in `wrangler.jsonc`, `runtime.d.ts`, and the D1 schema in `schema.sql`.

## Build, Test, and Development Commands

- `pnpm install` – install dependencies in line with the lockfile.
- `pnpm dev` – run the worker with Wrangler hot reload.
- `pnpm dev:local` – execute `src/local-test.ts` with `.env.local` to mimic Telegram locally.
- `pnpm dev:full` – start the full ngrok + Wrangler loop for webhook testing.
- `pnpm test` – run Vitest (add `--watch` when iterating).
- `pnpm format` – apply Prettier formatting before commits.
- `pnpm deploy` / `pnpm deploy:prod` – push preview or production builds via Wrangler.

## Coding Style & Naming Conventions

Author strict TypeScript (see `tsconfig.json`) and favor descriptive, imperative function names that mirror Telegram actions. Keep modules ES2022, export commands through the barrel in `src/commands/index.ts`, and default to named exports. Prettier (two-space indent, single quotes) is canonical; avoid manual formatting drift. Use kebab-case for scripts, camelCase for runtime identifiers, and SCREAMING_SNAKE_CASE only for constants sourced from env.

## Testing Guidelines

Place worker or service specs in `test/` named `*.test.ts`. Vitest runs with Cloudflare worker shims, so load secrets through `.env` or per-run overrides. Cover command flows, session persistence, and OpenAI error handling; stub network calls and embeddings when tests would otherwise hit external APIs. New services should ship with unit coverage plus, when feasible, an integration test that drives the command pipeline end to end.

## Commit & Pull Request Guidelines

Follow the existing log: short, imperative subjects (e.g., `turn off image generation`) with optional issue references in parentheses. PRs should include a concise summary, verification steps or commands run, screenshots for user-facing adjustments, and linked issues. Flag any config or secret changes so reviewers can update Wrangler environments before merging.

## Security & Configuration Tips

Store secrets with `wrangler secret put` or in `.env.local`; never commit tokens. Double-check `scripts/setup-webhook.js` arguments before running, especially when switching between tunnels and production domains. Remove temporary ngrok URLs when promoting to production and rotate API keys if they were exposed during debugging.
