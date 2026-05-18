# familiar — Agent Guide

This document contains the essential context an AI coding agent needs to work effectively in the familiar codebase.

## Project Overview

familiar is a hosted tool router with memory. It receives text from any channel (web, email, messaging), decides which tool to call, executes it via webhook, and remembers context across conversations. The next message picks up where the last one left off.

The project is currently an MVP in progress. The core shape is in place but the product is still being hardened.

## Technology Stack

- **Runtime**: Cloudflare Workers
- **Framework**: [RedwoodSDK](https://docs.rwsdk.com) (`rwsdk`) — React Server Components (RSC) + RPC-based client navigation
- **Language**: TypeScript 5.9, ES modules (`"type": "module"`)
- **Build Tool**: Vite 7 with `@cloudflare/vite-plugin`
- **Bundler**: Vite handles both client and worker builds
- **AI Routing**: OpenRouter by default; Cloudflare Workers AI optionally via `TEXTY_USE_WORKERS_AI_ROUTING`
- **Package Manager**: npm (lockfile present; `pnpm` config exists for `onlyBuiltDependencies`)
- **Node Version**: >= 22

## Project Structure

```
├── src/
│   ├── worker.tsx              # Worker entry point; defines app routes, middleware, Durable Object exports
│   ├── client.tsx              # Browser entry point; initializes RedwoodSDK client-side navigation
│   └── app/
│       ├── account/            # Account management, auth, CLI sessions, AccountRegistry Durable Object
│       ├── chat/               # Chat session state, memory engine, conversation runtime, storage
│       ├── provider/           # Core API: tool sync, conversation input, execution, threads, idempotency
│       ├── session/            # Browser session DO and cookie-based session store
│       ├── memory/             # Memory backend abstraction (DefaultMemoryBackend or MemPalaceMemoryBackend)
│       ├── pages/              # Page components (home, docs, chat, debug, sandboxes, setup)
│       ├── layouts/            # Shared page layouts (docs-layout, public-layout)
│       ├── components/         # Shared React components (logo, navigation, chrome)
│       ├── docs/               # Docs site rendering logic + content manifest
│       ├── docs-content/       # Markdown content files for the docs site
│       └── styles/             # Global CSS variables and typography
├── packages/
│   ├── sdk/                    # TypeScript SDK for the familiar API (`familiar-sdk`)
│   └── cli/                    # CLI tool for account management, tool sync, tunnels (`familiar-cli`)
├── examples/
│   ├── minimal-executor/       # Smallest useful executor example
│   ├── async-countdown/        # Async callback / executor webhook example
│   └── pinned-tool/            # Tool shortcut invocation example (`@tool-name` syntax)
├── types/                      # Additional TypeScript declarations (env, vite, rw, css)
├── scripts/                    # Utility scripts (memory reset, release deployment)
├── public/                     # Static assets (SVG logos, favicons)
├── dist/                       # Build output (client + worker)
├── wrangler.jsonc              # Cloudflare Workers deployment config
├── vite.config.mts             # Vite build configuration
├── tsconfig.json               # TypeScript configuration
└── .dev.vars / .dev.vars.example  # Local development secrets
```

### Key Modules

| Module | Purpose |
|--------|---------|
| `src/app/provider/` | Public API surface. Handles `/api/v1/*` endpoints for tool sync, conversation input, executor result callbacks, thread CRUD, and health checks. |
| `src/app/chat/` | Chat session state machine, memory synthesis, conversation prompts, and per-thread storage. |
| `src/app/account/` | Account lifecycle, API token auth, CLI session polling, and the AccountRegistry Durable Object. |
| `src/app/memory/` | Pluggable memory backend. `memory.factory.ts` selects between the built-in default or an external MemPalace backend. |
| `src/app/session/` | Browser-side session management via `defineDurableSession` from `rwsdk/auth`. |

## Build and Development Commands

All commands run from the project root.

```bash
# Install dependencies
npm install

# Start local dev server (Vite + Wrangler local Workers runtime)
npm run dev

# Type-check the project
npm run check          # runs `generate` then `types`
npm run types          # runs `tsc --noEmit`
npm run generate       # regenerates wrangler types from .dev.vars + wrangler config

# Build for production
npm run build          # Vite production build

# Preview production build locally
npm run preview

# Run tests
npm test               # Node.js built-in test runner with experimental strip-types

# Clean build caches
npm run clean          # removes ./node_modules/.vite

# Utility scripts
npm run memory         # reset or debug sandbox memory contexts
npm run release        # interactive deployment script
```

The dev server listens on `http://localhost:5173` by default.

## Code Style and Conventions

- **Modules**: Always ES modules. Use `.ts` / `.tsx` extensions in imports (TypeScript `allowImportingTsExtensions: true`).
- **Aliases**: Use `@/` for project-relative imports (e.g., `import { foo } from "@/app/chat/shared.ts"`).
- **Strict TypeScript**: All strict flags are enabled. `noEmit` is used; types are checked only.
- **Durable Objects**: Each DO lives in its own file (e.g., `chat-session-do.ts`, `browser-session-do.ts`).
- **Route handlers**: API endpoints are constructed via factory functions for testability. Core logic is in `*-core.ts` files; the wired handler re-exports from the factory. See `provider.conversation.endpoint.core.ts` + `provider.conversation.endpoint.ts`.
- **HTTP helpers**: Shared JSON response/error utilities live in `provider.http.ts`.
- **Naming**: camelCase for variables/functions, PascalCase for types/classes, kebab-case for filenames.
- **Environment access**: Inside worker code, use `env` from `cloudflare:workers`. Types are augmented in `types/env.d.ts` and auto-generated in `worker-configuration.d.ts`.

## Testing Strategy

- **Runner**: Node.js built-in `node:test` with `node:assert/strict`.
- **Invocation**:
  ```bash
  node --experimental-strip-types --experimental-specifier-resolution=node --test "src/**/*.test.ts"
  ```
- **Patterns**:
  - Tests are co-located next to source files (e.g., `account.http.test.ts` beside `account.http.ts`).
  - Endpoint tests inject dependencies as objects so handlers can be tested without the full app server.
  - Mock data uses explicit factory helpers in test files rather than external fixtures.
- **No UI test framework** is currently set up.

## Architecture Details

### Request Flow

1. User input arrives at `POST /api/v1/input`.
2. The provider authenticates the request via Bearer token.
3. familiar loads (or creates) the `ProviderUserContext` Durable Object for that user.
4. It loads the relevant thread and global memory.
5. An LLM route decides the response type: direct reply, follow-up question, or tool handoff.
6. If a tool is selected, familiar validates arguments against the synced schema and calls the executor webhook.
7. The result is stored in the thread and returned to the caller.

### Durable Objects

Defined in `wrangler.jsonc` and exported from `src/worker.tsx`:

| Binding | Class | Purpose |
|---------|-------|---------|
| `BROWSER_SESSIONS` | `BrowserSessionDurableObject` | Cookie-backed browser sessions |
| `CHAT_SESSIONS` | `ChatSessionDurableObject` | Per-thread chat state storage |
| `PROVIDER_USER_CONTEXTS` | `ProviderUserContextDurableObject` | Per-user tool lists, memory policy, rate limits, audit log |
| `ACCOUNT_REGISTRY` | `AccountRegistryDurableObject` | Account and token registry |

### Memory System

- **Thread memory**: Summaries, keywords, and facts scoped to a single conversation thread.
- **Global memory**: Cross-thread facts organized by category (identity, family, work, preferences, etc.).
- **Backend**: Swappable via `FAMILIAR_MEMORY_BACKEND` env var. Default is in-process; `mempalace` routes to an external service.
- **Synthesis**: User profiles are periodically synthesized from conversation history and stored in global memory.

### Tool Contract

Tools are synced via `POST /api/v1/tools/sync`. Each tool declares:
- `tool_name` — internal identifier
- `description` — natural language explanation for routing
- `input_schema` — JSON schema for argument extraction
- `status` — `active` or `disabled`
- `input_mode` — optional `"processed"` or `"raw"`

The executor receives validated arguments matching this schema, not raw user text.

### Execution States

- `completed` — tool finished successfully
- `needs_clarification` — missing required arguments
- `accepted` / `in_progress` — async work accepted; executor will callback later
- `failed` — tool could not complete

Async callbacks go to `POST /api/v1/webhooks/executor` with the execution result.

## Environment Variables

Local secrets go in `.dev.vars` (never committed):

| Variable | Purpose |
|----------|---------|
| `OPENROUTER_API_KEY` | Required. API key for OpenRouter LLM calls. |
| `OPENROUTER_MODEL` | Default routing model (e.g. `openai/gpt-4o-mini`). |
| `OPENROUTER_MEMORY_MODEL` | Model used for memory synthesis. |
| `OPENROUTER_SITE_URL` | Site URL for OpenRouter rankings. |
| `OPENROUTER_SITE_NAME` | Site name for OpenRouter rankings. |
| `TEXTY_USE_WORKERS_AI_ROUTING` | Set to `true` to use Cloudflare Workers AI instead of OpenRouter for routing/extraction. |
| `CLOUDFLARE_ROUTING_MODEL` | Workers AI model for intent routing (default: `@cf/meta/llama-3.1-8b-instruct-fast`). |
| `CLOUDFLARE_EXTRACTION_MODEL` | Workers AI model for schema extraction (default: `@cf/qwen/qwen3-30b-a3b-fp8`). |
| `FAMILIAR_MEMORY_BACKEND` | `default` or `mempalace`. |

Production secrets are managed via `wrangler secret` and referenced in `wrangler.jsonc`.

## Deployment Process

Deployment target is Cloudflare Workers.

```bash
npm run release
```

This script:
1. Prompts for confirmation.
2. Ensures the Cloudflare account and worker exist.
3. Creates `AUTH_SECRET_KEY` if auth code is detected and the secret is missing.
4. Runs `npm run clean` and `npm run build`.
5. Runs `wrangler deploy`.

Manual deploy is also possible:
```bash
npm run build
npx wrangler deploy
```

### Wrangler Config

- Entry: `src/worker.tsx`
- Worker name: `familiar`
- Compatibility date: `2025-08-21`
- Flag: `nodejs_compat`
- Assets binding: `ASSETS`
- AI binding: `AI`

## Agent Rules

1. **Explain every change.** Whenever you make changes to code, explain to the user:
   - What was changed (which files, functions, data structures).
   - Why it was changed (the problem it solves or the feature it enables).
   - How the logic flow in the app changed — trace the request or data flow before and after.

## Security Considerations

- **Auth**: Provider API requests require `Authorization: Bearer <token>`. Tokens are hashed before storage in the AccountRegistry DO.
- **CLI auth**: Uses short-lived CLI sessions polled by the browser, completed via `POST /api/v1/auth/cli/sessions/:id/complete`.
- **Idempotency**: Write endpoints support `Idempotency-Key` headers. Replays are stored in the ProviderUserContext DO.
- **CSP**: Strict Content-Security-Policy headers are set in `src/app/headers.ts` including nonce-based script-src.
- **Rate limiting**: Conversation input and tool sync endpoints have per-user rate limits implemented in `provider.logic.ts`.
- **No secrets in code**: `.dev.vars` is gitignored. Production secrets are injected by Wrangler.

## Packages

### SDK (`packages/sdk/`)

A lightweight TypeScript client for the familiar API. Built with `tsc` only.

```bash
cd packages/sdk
npm run build   # outputs to dist/
```

### CLI (`packages/cli/`)

A Node.js CLI distributed as a single `.mjs` file.

Commands: `init`, `login`, `account create`, `whoami`, `set-key`, `tools sync`, `portal`.

Reads config from `~/.familiar/config.json` and `.dev.vars` in the current directory.

## Examples

Three working executor examples live under `examples/`:

- `minimal-executor/` — basic tool sync + todo list demo
- `async-countdown/` — returns `accepted` immediately, callbacks later via executor webhook
- `pinned-tool/` — `@tool-name` shortcut syntax for explicit single-message tool invocation

Each example includes its own `server.mjs`, `executor.mjs`, `familiar.json`, and `index.html`.
