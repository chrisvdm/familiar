# Worklog: Add streaming assistant responses (#24)

## Date
2026-05-08

## Issue
- #24: Add streaming assistant responses

## Goal
Stream the assistant's direct reply text as it is generated, rather than waiting for the full response.

## Plan
1. Add `callOpenRouterStream` to the OpenRouter client — SSE parser that yields text chunks
2. Add `buildDirectReplyStream` — async generator that wraps the streaming client
3. Modify `decideConversationAction` to support `generateReply: false` — returns the action type without generating reply text
4. Create `handleStreamConversationInput` — orchestrates setup, decision, and streaming
5. Wire `POST /api/v1/input/stream` route
6. Add SDK `familiar.inputStream()` — async generator of SSE events
7. Update docs

## Architecture
- **Separation of concerns**: the decision model runs first (non-streaming) to determine action type. Only `direct_reply` content is streamed. Tool calls and clarifications emit a single `decision` event followed by `done`.
- **SSE protocol**: `decision` → `delta` (zero or more) → `done`. Errors emit `error` and close.
- **Auth/rate-limit errors** are returned as HTTP errors before the stream starts, so the client doesn't need to parse SSE for common failures.
- **No idempotency** on the stream endpoint in MVP — can be added later.

## Status
- [x] OpenRouter streaming client
- [x] `buildDirectReplyStream`
- [x] `decideConversationAction` with `generateReply` option
- [x] `handleStreamConversationInput`
- [x] Route wired — `POST /api/v1/input/stream`
- [x] SDK `familiar.inputStream()`
- [x] Docs updated — quickstart, mvp-spec, api-spec, SDK README
- [x] Tests pass — 147/148 (pre-existing failure)

## Commits
- [this work] feat(api): add streaming assistant responses via POST /api/v1/input/stream (#24)
