# 2026-03-24 Held Tool Context And Async Countdown Example

## Goal

Finish the agreed `@[tool-name]` behavior and add a dedicated async webhook example that demonstrates delayed executor results.

## Changes

- Tightened the held tool context exit rule:
  - `@[tool-name]` establishes the held tool context for the thread
  - Texty stays in that context until the user says `that's all for [tool-name]`
  - invoking another `@[tool-name]` switches the held tool context
  - Texty does not silently exit just because later text looks conversational
- Updated the service wording away from "shortcut mode" and toward "holding tool context".
- Added a separate async example at `examples/async-countdown`:
  - `countdown.start` always returns `accepted`
  - the example waits 10 seconds
  - it then calls `POST /api/v1/webhooks/executor`
  - the example receives outbound channel delivery on `POST /channels/messages`
- Added a future security note about internal documentation access boundaries.

## Result

The shortcut behavior now matches the intended product rule, and there is a dedicated example for the async executor webhook flow instead of overloading the todo demo.

## Verification

- `npm test -- src/app/provider/provider.logic.test.ts src/app/provider/provider.conversation.endpoint.test.ts src/app/provider/provider.execution.test.ts src/app/provider/provider.executor-result.endpoint.test.ts`
- `npm run types`
- `node --check examples/async-countdown/server.mjs`
- `node --check examples/async-countdown/executor.mjs`
