# Agent Quickstart Docs

## Summary

Added `src/app/docs-content/agent-quickstart.md` — a dedicated onboarding guide for AI agents that uses the API directly, with no CLI or browser steps.

## Motivation

Issue #24. All existing docs assumed a human developer with a terminal. AI agents need a guide written in API-first language: single-call account creation, SDK examples, and validation via JSON Schema.

## Changes

- `src/app/docs-content/agent-quickstart.md` — new docs page
- `src/app/docs/content.ts` — added `agent-quickstart` to `DOC_ORDER` (positioned after SDK, before human-oriented quickstart)

## Content

1. **Single-call onboarding** — `POST /api/v1/accounts` with `base_url`, `ai_api_key`, and `tools`
2. **Send a message** — `POST /api/v1/input` with bearer token
3. **SDK equivalent** — `FamiliarClient.createAccount({ baseUrl, aiApiKey, tools })`
4. **Schema validation** — link to published JSON Schema
5. **Next steps** — links to executors, webhooks, API reference
