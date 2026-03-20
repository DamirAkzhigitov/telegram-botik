# LLM provider adapter — implementation guide

This document is the **spec for a future refactor**: decouple the worker from a single OpenAI-shaped integration so providers (or OpenAI-compatible gateways) can be selected via configuration without rewriting the bot pipeline.

It complements [testing-e2e-and-llm.md](./testing-e2e-and-llm.md) (how to test LLM boundaries) and [AGENTS.md](../AGENTS.md) (repo layout and commands).

---

## 1. Goals

| Goal                                   | Notes                                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Swap providers via config**          | e.g. OpenAI direct vs Azure vs Groq vs LiteLLM proxy — without branching business logic in handlers.                 |
| **Isolate three API surfaces**         | Chat Completions, structured “main reply”, and embeddings are different capabilities; one mega-client obscures that. |
| **Preserve behavior during migration** | First milestone: OpenAI-only implementation behind ports, **no user-visible change**.                                |
| **Typed internal contracts**           | Reduce reliance on `OpenAI.Responses.*` in session/history types over time (optional follow-up).                     |

Non-goals for v1:

- Supporting every vendor’s native SDK in the first PR.
- Automatic re-embedding of Pinecone data when embedding models change (operational concern; document only).

---

## 2. Current coupling (inventory)

Use this as a checklist when moving code behind ports.

### 2.1 Responses API (`openai.responses.create`)

| File                                          | Role                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [`src/gpt.ts`](../src/gpt.ts)                 | Main bot reply: developer prompts, `input`, JSON schema structured output, optional tools / image output parsing. |
| [`src/bot/history.ts`](../src/bot/history.ts) | `createConversationSummary` — summarization with `store: false`.                                                  |

### 2.2 Chat Completions (`openai.chat.completions.create`)

| File                                                              | Role                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| [`src/bot/addressed.ts`](../src/bot/addressed.ts)                 | Directed-reply classification.                            |
| [`src/bot/mood.ts`](../src/bot/mood.ts)                           | Mood updates.                                             |
| [`src/bot/memoryObserver.ts`](../src/bot/memoryObserver.ts)       | Background memory extraction.                             |
| [`src/cron/proactiveRevival.ts`](../src/cron/proactiveRevival.ts) | Thread revival classification + small message generation. |

### 2.3 Embeddings (`openai.embeddings.create`)

| File                                                                    | Role                                                                 |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`src/service/EmbeddingService.ts`](../src/service/EmbeddingService.ts) | `text-embedding-3-small`, **512 dimensions**, Pinecone upsert/query. |

### 2.4 Types and wiring

- Session and history shapes reference **`OpenAI.Responses.*`** in [`src/types.ts`](../src/types.ts), [`src/bot/messageBuilder.ts`](../src/bot/messageBuilder.ts), [`src/service/SessionController.ts`](../src/service/SessionController.ts), etc.
- Bot wiring: [`src/bot/createBot.ts`](../src/bot/createBot.ts) calls `getOpenAIClient(env.API_KEY)` and passes `responseApi` + raw `openai` into [`src/bot/messageHandler.ts`](../src/bot/messageHandler.ts).
- Cron: [`src/cron/proactiveRevival.ts`](../src/cron/proactiveRevival.ts) also uses `getOpenAIClient`.

---

## 3. Recommended architecture

### 3.1 Three ports (interfaces)

Introduce small interfaces under e.g. `src/llm/` (exact names are suggestions):

1. **`StructuredReplyPort`** (replaces direct use of Responses for the main JSON-schema reply path)

   - Method roughly equivalent to today’s `responseApi` in `gpt.ts`: accepts normalized **input messages** + options (`model`, `prompt` / mind vs custom, `moodText`, `hasEnoughCoins`, …) and returns `MessagesArray | null` (see [`src/types.ts`](../src/types.ts)).

2. **`ChatCompletionsPort`**

   - Covers all `chat.completions.create` call sites. Options:
     - **Narrow interface**: only the parameters actually used (model, messages, temperature, response format, etc.), or
     - **Thin wrapper** around a minimal subset of the OpenAI chat API shape for easier OpenAI-compatible gateways.

3. **`EmbeddingsPort`**
   - `embed(text: string): Promise<number[]>` **or** explicit `(inputs, model, dimensions)` matching current Pinecone expectations.
   - Implementation must honor **512 dimensions** for the existing Pinecone index unless migration is planned.

Optional fourth: a **`TextGenerationPort`** if summarization is implemented differently per provider (e.g. Responses vs Chat); otherwise summarization can sit behind `StructuredReplyPort` or `ChatCompletionsPort` with a dedicated method.

### 3.2 Factory

- **`createLlmStack(env: Env)`** (name TBD) returns `{ structuredReply, chat, embeddings }` (or a single facade object with those three).
- Select implementation from env (see §4). Default remains current OpenAI behavior.

### 3.3 OpenAI as first implementation

- **`OpenAIStructuredReplyAdapter`**: delegate to existing logic in `gpt.ts` (possibly moved into the adapter module), still using `openai.responses.create`.
- **`OpenAIChatAdapter`**: wrap `openai.chat.completions.create`.
- **`OpenAIEmbeddingsAdapter`**: wrap `openai.embeddings.create` with current model/dimensions.

No behavior change until tests pass.

### 3.4 OpenAI-_compatible_ gateways (typical “quick switch”)

Many providers expose an OpenAI-compatible HTTP API. The official `openai` SDK supports **`baseURL`** + **`apiKey`**. A second implementation can:

- Instantiate `OpenAI` with `baseURL` from env and the provider’s key.
- Reuse the same adapter classes if the gateway supports **Chat Completions** and **Embeddings** in compatible form.

**Caveat:** not every gateway implements the **Responses** API. If the gateway only exposes Chat Completions, `StructuredReplyPort` needs an alternative implementation: e.g. **`chat.completions.create`** with **`response_format` / JSON schema** (where supported) and the same parsing into `MessagesArray`. That is a **separate code path** inside the structured-reply adapter, not a second copy of business logic in handlers.

---

## 4. Configuration (env / secrets)

Define explicitly in Wrangler and `.env.local` (names are proposals — align with [`src/env.d.ts`](../src/env.d.ts) when implementing):

| Variable                                   | Purpose                                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_PROVIDER`                             | e.g. `openai` \| `openai_compatible` \| future vendor ids.                                                                                           |
| `API_KEY`                                  | Primary secret (keep current name if already bound everywhere).                                                                                      |
| `OPENAI_BASE_URL`                          | Optional; when set, pass to OpenAI SDK `baseURL` for compatible gateways.                                                                            |
| `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` | Optional split if embeddings are routed differently from chat.                                                                                       |
| Model IDs                                  | Prefer **vars** or secrets for `DEFAULT_TEXT_MODEL`, embedding model, etc. (see [`src/constants/models.ts`](../src/constants/models.ts) if present). |

`XAI_API_KEY` already appears in [`src/env.d.ts`](../src/env.d.ts); either wire it in the factory or remove if unused.

Document which combinations are tested (e.g. OpenAI direct + one compatible gateway in staging).

---

## 5. Embedding and Pinecone constraints

- **Dimensions:** Current code uses **512** for `text-embedding-3-small`. Any embedding model change must match index config or require a **new index / re-embed** strategy.
- **Semantic drift:** Swapping embedding providers changes retrieval quality; treat as a **data/ops** migration, not only a code swap.

---

## 6. Phased implementation plan

### Phase A — Ports + OpenAI-only implementation

1. Add `src/llm/` (or equivalent) with the three interfaces and OpenAI implementations.
2. Change `getOpenAIClient` usage sites to inject the stack from `createLlmStack(env)` (or adapt `getOpenAIClient` to return the new types internally).
3. Update handlers (`messageHandler`, cron, `history`) to depend on **ports**, not `OpenAI` class.
4. Run `pnpm validate`.

### Phase B — OpenAI-compatible gateway

1. Read `OPENAI_BASE_URL` (and optional separate embedding base URL).
2. Instantiate SDK clients with `baseURL`.
3. Smoke-test Chat + Embeddings; validate Responses support or fall back to Chat+json schema for structured reply.

### Phase C — Internal message types (optional)

Replace `OpenAI.Responses.*` in session/history with app-owned types + mappers at the adapter boundary to reduce vendor type leakage.

---

## 7. Testing strategy

| Layer           | What to test                                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit**        | Each port implementation with mocked HTTP or mocked SDK methods (same spirit as [`test/bot.test.ts`](../test/bot.test.ts) for `responses.create`).                           |
| **Contract**    | Structured reply: assert assembled `input` / schema and parsed `MessagesArray` for representative cases.                                                                     |
| **Integration** | Existing [`test/e2e/webhook-message.test.ts`](../test/e2e/webhook-message.test.ts): mock the **new** factory or ports instead of `getOpenAIClient` if the mock target moves. |
| **Staging**     | Manual or scripted call with real gateway + capped budget.                                                                                                                   |

Update [testing-e2e-and-llm.md](./testing-e2e-and-llm.md) when the mock surface changes (e.g. `vi.mock('src/llm/...')`).

---

## 8. File / module map (after refactor)

Suggested layout (adjust to taste):

| Path                 | Responsibility                                                                  |
| -------------------- | ------------------------------------------------------------------------------- |
| `src/llm/types.ts`   | Port interfaces + shared DTOs.                                                  |
| `src/llm/openai.ts`  | OpenAI implementations (may absorb most of `gpt.ts` chat/response wiring).      |
| `src/llm/factory.ts` | `createLlmStack(env)`.                                                          |
| `src/gpt.ts`         | Deprecated or slim re-export during migration; remove when all imports updated. |

---

## 9. Risks and mitigations

| Risk                                 | Mitigation                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| Responses API unavailable on gateway | Second implementation: Chat Completions + structured JSON parsing; feature-flag per env. |
| Embedding dim mismatch               | Port API exposes dimensions; assert at startup; document re-index.                       |
| Type churn                           | Phase C: internal message types; map at boundary only.                                   |
| Secret sprawl                        | Single `API_KEY` default; document optional split keys.                                  |

---

## 10. Definition of done (v1)

- [ ] `createBot` and cron paths use **injected ports**, not raw `OpenAI` in handler signatures.
- [ ] `pnpm validate` passes.
- [ ] Default deployment behavior matches pre-refactor OpenAI usage.
- [ ] This doc’s env variables are listed in deployment notes / PR template when merging.

---

## 11. References

- OpenAI SDK: [Chat Completions](https://platform.openai.com/docs/api-reference/chat), [Responses](https://platform.openai.com/docs/api-reference/responses), [Embeddings](https://platform.openai.com/docs/api-reference/embeddings).
- Project: [`src/gpt.ts`](../src/gpt.ts), [`src/bot/createBot.ts`](../src/bot/createBot.ts), [`src/service/EmbeddingService.ts`](../src/service/EmbeddingService.ts).
