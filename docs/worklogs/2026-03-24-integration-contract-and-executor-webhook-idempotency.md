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
  - conflicting reuse returns `409 idempotency_conflict`
  - duplicate callbacks do not append duplicate assistant messages or trigger duplicate channel sends

## Result

The public contract now matches the current product model instead of carrying early MVP naming, and the async executor callback path is safe for normal webhook retries.

## Verification

- `npm run types`
- `npm test -- src/app/provider/provider.executor-result.endpoint.test.ts src/app/provider/provider.execution.test.ts src/app/provider/provider.conversation.endpoint.test.ts src/app/provider/provider.thread-create.endpoint.test.ts src/app/provider/provider.thread-mutation.endpoint.test.ts src/app/provider/provider.tools-sync.endpoint.test.ts src/app/provider/provider.auth-core.test.ts`
- `node --check examples/minimal-executor/server.mjs`
- `node --check examples/minimal-executor/executor.mjs`
