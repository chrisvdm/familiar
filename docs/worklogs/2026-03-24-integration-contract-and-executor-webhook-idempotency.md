# 2026-03-24 Integration Contract And Executor Webhook Idempotency

## Goal

Align the public Texty API with the clarified product terms and harden the executor callback path for real retry behavior.

## Changes

- Renamed the public API contract from `provider` to `integration`:
  - request bodies now use `integration_id`
  - scoped routes now use `/api/v1/integrations/...`
  - docs, sandbox UI, and the minimal executor example now use the same terminology
- Kept `account`, `integration`, `executor`, `user_id`, and `channel` as the working product vocabulary.
- Kept the async executor callback route at:
  - `POST /api/v1/webhooks/executor`
- Added idempotency handling to the executor webhook endpoint:
  - `Idempotency-Key` replays the original success response
  - `result.execution_id` is used as a retry key fallback when no idempotency header is present
  - conflicting reuse returns `409 idempotency_conflict`
  - duplicate callbacks do not append duplicate assistant messages or trigger duplicate channel sends
- Added execution correlation to the initial conversation response:
  - Texty now returns `execution.state`
  - Texty now returns `execution.execution_id`
- Updated the minimal executor example to:
  - surface `execution_id` in its observed task metadata
  - reuse `execution_id` as the callback `Idempotency-Key`

## Result

The public contract now matches the current product model instead of carrying early MVP naming, and the async executor callback path now has both correlation and retry safety for real async execution.

## Verification

- `npm run types`
- `npm test -- src/app/provider/provider.executor-result.endpoint.test.ts src/app/provider/provider.execution.test.ts src/app/provider/provider.conversation.endpoint.test.ts src/app/provider/provider.thread-create.endpoint.test.ts src/app/provider/provider.thread-mutation.endpoint.test.ts src/app/provider/provider.tools-sync.endpoint.test.ts src/app/provider/provider.auth-core.test.ts`
- `node --check examples/minimal-executor/server.mjs`
- `node --check examples/minimal-executor/executor.mjs`
