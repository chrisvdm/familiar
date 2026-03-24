# 2026-03-24 Hosted Demo Routes For Async And Pinned Tool

## Goal

Make the new async countdown and pinned tool examples available on the deployed worker so the MVP can be tested end to end without running local example servers.

## Changes

- Added built-in integration ids for:
  - `demo_countdown`
  - `demo_pinned_tool`
- Registered built-in provider auth configs for:
  - `/sandbox/async-countdown`
  - `/sandbox/pinned-tool`
- Added hosted demo routes for:
  - `/sandbox/async-countdown`
  - `/sandbox/async-countdown/playground/texty`
  - `/sandbox/async-countdown/tools/execute`
  - `/sandbox/async-countdown/channels/messages`
  - `/sandbox/pinned-tool`
  - `/sandbox/pinned-tool/playground/texty`
  - `/sandbox/pinned-tool/tools/execute`
- Wired the hosted async countdown demo to:
  - return `accepted`
  - wait 10 seconds in a background task
  - call `POST /api/v1/webhooks/executor`
  - capture outbound channel delivery messages
- Updated the example READMEs with live demo URLs for the deployed worker.

## Result

Texty now exposes all three demo flows on the deployed worker:

- minimal executor
- async countdown
- pinned tool

That makes it possible to do one full MVP test pass against the live deployment instead of mixing deployed and local-only demos.

## Verification

- `npm run types`
- `node --check examples/async-countdown/server.mjs`
- `node --check examples/pinned-tool/server.mjs`
