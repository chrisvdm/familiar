# MVP Docs Pass

## Context

We want MVP-ready user documentation that correctly covers four things: what familiar is and why it is useful, the API, the CLI (`familiar-cli`), and the SDK (`familiar-sdk`). The current docs in `src/app/docs-content/` were partially written before the CLI and SDK existed and have not been updated to reflect the full picture. We are doing a cross-reference pass against the blueprints, worklogs, and actual code before making changes.

---

## Investigation

### What is shipped and working

From the April 22 MVP verification worklog (`2026-04-22-mvp-verification.md`) and direct code inspection:

**API** — all endpoints in `current-mvp-spec.md` are live and verified:
- `POST /api/v1/accounts`
- `GET /api/v1/account`
- `GET/PATCH /api/v1/integration` (includes `ai_api_key` from April 23 worklog)
- `POST /api/v1/input`
- `POST /api/v1/tools/sync`
- `POST /api/v1/threads`
- `PATCH /api/v1/threads/:thread_id`
- `DELETE /api/v1/threads/:thread_id`
- `GET /api/v1/users/:user_id/threads`
- `GET /api/v1/users/:user_id/memory`
- `GET /api/v1/threads/:thread_id/memory`
- `POST /api/v1/webhooks/executor`

Also exists as alias: `POST /api/v1/conversation/input` (same handler as `/api/v1/input`)

**CLI** (`familiar-cli`, `packages/cli/familiar.mjs`) — fully implemented:
- `familiar init` — creates account, stores token globally
- `familiar account create` — creates account, prints token without storing
- `familiar account show` / `familiar whoami` — shows account details
- `familiar set-key <key>` — sets OpenRouter key via `PATCH /api/v1/integration`
- `familiar tools sync [--file <path>]` — syncs tools from `familiar.tools.json`
- `familiar portal --port <port>` — starts cloudflared tunnel, registers URL, clears on exit

**SDK** (`familiar-sdk`, `packages/sdk/`) — fully implemented:
- `Familiar.createAccount({ host? })`
- `new Familiar({ token, host? })`
- `familiar.input({ text, channel, userId?, threadId?, integrationId?, tools? })`
- `familiar.tools.sync({ tools })`
- `familiar.integration.get()`
- `familiar.integration.update({ aiApiKey?, baseUrl? })`
- `FamiliarError` with `code`, `message`, `status`

Token resolution in CLI: reads from `FAMILIAR_TOKEN` in `.dev.vars` in cwd, then falls back to `~/.codex/familiar/config.json`.

---

### Gaps found in current user docs

**Gap 1 — CLI is not documented in user-facing docs** (critical)
`install-and-run.md` mentions `npx familiar-cli init` in passing but there is no CLI reference page in `docs-content/`. The commands `set-key`, `tools sync`, `portal`, and `account show` / `whoami` are completely absent. The CLI README exists in `packages/cli/README.md` but is not surfaced to users visiting the docs site.

**Gap 2 — SDK is not mentioned anywhere in user-facing docs** (critical)
There is no SDK page in `docs-content/`. The SDK README exists in `packages/sdk/README.md` but is invisible to anyone using the docs site. There is also no mention of it in `intro.md`, `install-and-run.md`, or `quickstart.md`.

**Gap 3 — Discord cookbook uses wrong endpoint** (incorrect)
`cookbook-discord-mentions.md` uses `POST /api/v1/conversation/input` throughout (route, curl example, pseudocode). The canonical endpoint is `POST /api/v1/input`. The alias exists and works, but the cookbook should match the primary documented endpoint for consistency.

**Gap 4 — Private thread creation flow is not documented** (missing, but nuanced)
The MVP verification found `thread_options.private` on `POST /api/v1/input` is silently ignored. The correct path to create a private thread is to call `POST /api/v1/threads` with `is_private: true` first, then pass `thread_id` to the input call. `concepts.md` mentions the concept of private threads is implied but never explains the correct API path. This is a real feature but needs accurate documentation.

**Gap 5 — `POST /api/v1/threads` requires `channel`** (undocumented)
The MVP verification found thread creation throws a runtime error when `channel` is omitted. The `api-reference.md` entry for "Create a thread" only shows `{ "title": "Q2 planning" }` — no `channel` field. This will confuse developers.

**Gap 6 — intro.md product description is good but mentions neither CLI nor SDK**
`intro.md` is accurate about what familiar does but makes no mention that there are two integration surfaces: a CLI for setup/operators and an SDK for in-code integration.

**Gap 7 — quickstart.md is curl-only**
The quickstart shows the full happy path entirely through curl. It should either show the SDK-first path or at minimum note the SDK is available.

**Gap 8 — Memory model is not user-facing documented**
The architecture blueprints define retrieval modes (`none`, `thread`, `provider_user`, `custom_scope`, `external`). None of this is surfaced in docs. However, the modes are not configurable via API in the MVP — this is a post-MVP feature. The memory endpoints (`GET /api/v1/users/:user_id/memory`, `GET /api/v1/threads/:thread_id/memory`) are real and documented but only as "inspect" utilities.

---

### What is deferred to post-MVP (must not be documented as current)

- Memory retrieval mode configuration (not configurable via API yet)
- Multi-integration account management (one account → many integrations)
- Custom `executor_payload` templates per tool (in docs but implementation status unclear)
- Cross-integration memory sharing / `custom_scope` mode
- Named Cloudflare tunnels with stable URLs (portal uses ephemeral only)
- Direct Anthropic/OpenAI key support (OpenRouter only in MVP)

---

## Findings

The core product description is accurate and well-aligned with blueprints. The API documentation (`api-reference.md`) is close to correct. The main problems are:

1. The CLI and SDK exist as shipped packages but are invisible in the docs site.
2. Three specific inaccuracies: Discord cookbook endpoint, private thread flow, thread creation payload.

---

## RFC

### 2000ft View

We will add two new docs pages (`cli.md`, `sdk.md`), fix three factual errors (cookbook endpoint, private thread path, thread creation payload), and update `intro.md` and `install-and-run.md` to surface the CLI and SDK as first-class paths. We will not add documentation for post-MVP features.

The `install-and-run.md` becomes the entry point that branches: "want to use the CLI? → CLI page", "want to use the SDK in code? → SDK page", "want raw API? → quickstart".

### Behavior Spec

**GIVEN** a developer visits `/docs/cli`  
**WHEN** they read the page  
**THEN** they can install, run `familiar init`, `set-key`, `tools sync`, and `portal` without visiting any other page

**GIVEN** a developer visits `/docs/sdk`  
**WHEN** they read the page  
**THEN** they can install, initialize a client, send input, sync tools, and handle errors without visiting any other page

**GIVEN** a developer follows the Discord cookbook  
**WHEN** they copy the route from the page  
**THEN** the endpoint matches the canonical `POST /api/v1/input`

**GIVEN** a developer reads the API reference entry for thread creation  
**WHEN** they copy the payload  
**THEN** it includes the required `channel` field

### Implementation Breakdown

- `[NEW]` `src/app/docs-content/cli.md` — full CLI reference derived from `packages/cli/README.md` and verified against `familiar.mjs`
- `[NEW]` `src/app/docs-content/sdk.md` — full SDK reference derived from `packages/sdk/README.md` and verified against `src/index.ts`
- `[MODIFY]` `src/app/docs-content/intro.md` — add one sentence naming the CLI and SDK as the two integration surfaces
- `[MODIFY]` `src/app/docs-content/install-and-run.md` — add CLI and SDK as paths alongside the API; link to new pages
- `[MODIFY]` `src/app/docs-content/cookbook-discord-mentions.md` — replace `/api/v1/conversation/input` with `/api/v1/input` throughout
- `[MODIFY]` `src/app/docs-content/api-reference.md` — add `channel` to thread creation payload; clarify private thread creation requires `is_private: true` on thread creation, not `thread_options` on input
- `[MODIFY]` `src/app/docs-content/concepts.md` — clarify private thread creation is a two-step flow (create thread with `is_private: true`, then pass `thread_id` on input)

### Invariants

- We do not document any post-MVP feature (memory modes, multi-integration, custom payload templates).
- Every code example in new pages is verified against the actual shipped code.
- SDK examples use camelCase property names (matches `Tool.toolName`, not `tool_name`).
- CLI examples show the `.dev.vars` token flow, not the global config path.

### Tasks

- [x] Create `cli.md`
- [x] Create `sdk.md`
- [x] Create `memory-backend.md`
- [x] Update `intro.md`
- [x] Update `install-and-run.md`
- [x] Fix `cookbook-discord-mentions.md`
- [x] Fix `api-reference.md` thread creation payload + private thread note
- [x] Fix `concepts.md` private thread flow
- [x] Wire new pages into the docs nav (`content.ts` DOC_ORDER + toLabel overrides for CLI/SDK)

---

## Clarifications (2026-04-28)

### Memory backend scope

The pluggable memory backend is an internal abstraction — integrators do not interact with it through the API. It is selected at runtime via env var. Two backends exist today:

- **Default** — Cloudflare Durable Objects + AI pipeline. Active when no env var is set.
- **MemPalace** — routes memory to a locally-running Python/ChromaDB server. Set `FAMILIAR_MEMORY_BACKEND=mempalace`.

A `MemoryBackend` TypeScript interface exists for contributors or self-hosters who want to build a custom backend. This requires implementing four methods (`retrieve`, `store`, `getThreadHistory`, `prune`) and wiring the backend into the factory.

**Documentation scope agreed:** document the feature as it actually is. Describe both options, include the env var config for MemPalace, and note the TypeScript interface for those who want to build their own. Do not present it as a general HTTP-backend feature since that is not implemented. Worth including because developers who self-host familiar may want to bring a richer memory store.

### Portal scope

`familiar portal --port <port>` is a fully implemented CLI command. It starts a cloudflared tunnel, registers the URL with familiar via `PATCH /api/v1/integration`, watches the process and re-registers on restart, and clears the URL on exit. It is the recommended local development path. It belongs on the CLI page, not as a standalone page.