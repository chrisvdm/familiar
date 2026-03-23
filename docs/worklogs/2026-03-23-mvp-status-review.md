# 2026-03-23 MVP Status Review

## Goal

Review the current Texty docs and runtime to determine how close the project is to the defined provider-aware MVP, and record what is complete versus what still blocks calling the MVP done.

## Scope Reviewed

- high-level product and architecture docs:
  - `docs/project-brief.md`
  - `docs/mvp-plan.md`
  - `docs/architecture-foundations.md`
  - `docs/provider-api-spec.md`
  - `docs/ai-integration-direction.md`
  - `docs/security-architecture.md`
- recent worklogs related to provider MVP, routing, latency, and the demo example
- current provider runtime, storage, auth, routing, execution, and web-chat integration code
- current minimal executor example

## Current MVP Read

The repo is close to the provider-aware MVP.

Practical estimate:

- roughly `85%` complete

The remaining work is mostly hardening and reliability, not missing foundation work.

## What Appears Complete

- provider-authenticated API routes exist for:
  - tool sync
  - conversation input
  - thread create
  - thread list
  - thread rename
  - thread delete
  - provider-user memory read
  - thread memory read
- provider/user-scoped context storage is implemented and includes:
  - shared memory
  - thread summaries
  - allowed tools
  - channel continuity state
  - memory policy
  - request log state for rate limiting
  - idempotency state
- provider token authentication and provider-ownership checks are implemented.
- private-thread isolation is implemented for shared-memory retrieval and shared-memory capture behavior.
- sync tool execution handoff is implemented.
- request tracing is implemented on the main provider endpoints.
- idempotency is implemented for write-style provider endpoints.
- rate limiting is implemented for:
  - conversation input
  - tool sync
- audit-style event logging is present.
- the web UI now uses the provider-backed conversation service path instead of maintaining a separate main chat runtime.
- the minimal executor demo reflects the current public product story and runs through Texty-first flow rather than presenting direct tool execution as the main path.

## What Still Looks Weak Before MVP Sign-Off

### 1. Tool routing and argument extraction quality

This is still the main open product risk.

- The runtime now includes confidence-based clarification and confirmation before tool execution.
- That improved the obvious false-positive cases.
- But the actual routing and extraction path is still prompt-driven and model-sensitive.

This means the biggest remaining MVP question is still:

- can Texty reliably decide between normal reply, clarification, and tool handoff
- can it extract clean arguments consistently enough for the demo and first integrations

### 2. Thread resolution is still heuristic

Channel continuity is implemented, but the current fallback is still lightweight:

- prefer the last active channel thread
- reuse it when token overlap crosses a simple threshold
- otherwise create a new thread

That is likely acceptable for an MVP, but it remains a weak point for wrong-thread continuation in ambiguous cases.

### 3. External retrieval support is only partially realized

The current runtime supports:

- `external_memories` in conversation input
- conditional use of that context when memory policy is `external`

But the review did not find a clear, stable runtime surface yet for actually setting provider-user memory policy away from the default `provider_user` mode.

So this looks more like:

- partial implementation of external retrieval behavior

than:

- fully surfaced MVP feature

### 4. Audit logging is still lightweight

Audit events are currently emitted as structured logs.

That is enough for current development visibility, but not yet durable operational audit storage.

This does not block the architectural MVP slice, but it does mean the current implementation is still a development-grade service boundary rather than a production-grade one.

## Current Non-MVP Or Later Work

The review also confirmed several items are still correctly outside MVP or post-MVP:

- async execution as a first-class runtime path
- public onboarding and token lifecycle tooling
- production-grade webhook verification for external inbound channels
- advanced retention/export tooling
- streaming provider responses
- more advanced memory provenance and deletion handling

## Code-Level Notes

- The web client now routes through provider-backed conversation handling using the built-in web provider identity.
- Provider/user context storage is the source of truth for provider-backed state.
- The current naming still uses `provider` on the wire and in code even though some docs are shifting the product framing toward `executor`.
- The current external API surface is therefore real enough to test and demo, even though some docs still describe the public contract as a target service shape rather than a fully hardened external platform.

## Verification

Validation was run against the current repo state:

- `git status --short`
  - clean working tree during the review
- `npm run types`
  - passed
- `npm run build`
  - completed successfully
  - Wrangler still emitted its local log-file permission warning under `~/Library/Preferences/.wrangler/logs/`, but the build itself finished
- `npm test`
  - mostly passed, but not fully green

## Validation Issue Found During Review

One concrete regression showed up during the review:

- `npm test` failed in `src/app/provider/provider.execution.ts`

Cause:

- the file imports `./provider.demo` without a resolvable extension under the current Node test runner setup

Effect:

- `src/app/provider/provider.execution.test.ts` fails with `ERR_MODULE_NOT_FOUND`

This is not the main product blocker, but it is a real repo-health issue that should be fixed so the provider MVP branch is fully green while routing/extraction work continues.

## Practical Conclusion

Texty is no longer missing the basic provider-aware MVP shape.

The repo already contains the core hosted conversation-service slice:

- authenticated provider API
- scoped threads and memory
- private-thread behavior
- sync tool handoff
- web UI through the same backend path
- example integration path

The main remaining MVP work is:

1. improve routing and argument extraction reliability
2. fix the current validation regression so the repo is green
3. continue simplifying and hardening the demo/integration path where needed
