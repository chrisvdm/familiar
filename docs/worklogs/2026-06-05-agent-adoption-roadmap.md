# Agent Adoption Roadmap

## Context

familiar's primary consumer is shifting toward AI coding agents. The current onboarding flow assumes a human developer with a laptop, a terminal, and the ability to run `cloudflared`. Agents operate in ephemeral, containerized, or restricted environments where tunnels may not be available and browser-based auth is impossible.

## Decisions

### Decision 1: Two-phase approach

**Chosen:** Address onboarding blockers first, then transport architecture.

**Motivation:** The webhook model works well for hosted executors. The immediate pain is not the transport layer — it's that agents give up before they ever host an executor because onboarding is too many steps. Eliminate the "create account → patch integration → sync tools → figure out hosting" funnel first. Once agents are successfully creating integrations, the tunnel problem becomes worth solving.

### Decision 2: Webhook stays the default; WebSocket is additive

**Chosen:** Keep webhook as the primary and default transport. Add WebSocket (via Durable Object) as an alternative for local dev and agent environments.

**Motivation:** The "script anywhere, familiar calls it" model is core to the product. Replacing it would break the simplest use case. A WebSocket executor connection is a power-user / agent feature, not a replacement. The executor declares its transport mode (`webhook` vs `websocket`).

### Decision 3: WebSocket over long-polling

**Chosen:** WebSocket (persistent bidirectional connection via Durable Object) rather than HTTP long-polling.

**Motivation:** Long-polling holds thousands of HTTP connections open with 30-second timeouts. That's expensive on Cloudflare Workers and introduces latency. WebSocket gives instant push, lower server overhead, and fits naturally into familiar's existing Durable Object architecture. Cloudflare Workers supports WebSockets in DOs natively.

## Phase 1: Onboarding Blockers (now)

| Issue | Goal |
|-------|------|
| #30 | Collapse account creation + integration config + tool sync into a single API call |
| #21 | Publish a machine-readable JSON Schema for `familiar.tools.json` so agents can validate manifests |
| #24 | Write agent-specific quickstart docs (API-first, no CLI, no browser) |
| #26 | Build a reproducible DX benchmark so we can measure agent onboarding friction |

## Phase 2: Transport (later)

- Add `ExecutorConnectionDurableObject` for WebSocket connections
- Add `transport: "websocket"` to integration config
- Executor opens `wss://familiar.monster/ws/executor` and receives work over the socket
- Webhook transport remains unchanged
