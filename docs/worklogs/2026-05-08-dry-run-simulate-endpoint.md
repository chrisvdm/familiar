# Worklog: Add POST /api/v1/input/simulate dry-run endpoint (#23)

## Date
2026-05-08

## Issue
- #23: Add POST /api/v1/input/simulate dry-run endpoint

## Goal
Let developers test tool routing without burning quota or polluting threads.

## Plan
1. Extract the "decision" logic from `handleProviderConversationInput` into a pure `simulateConversationInput` function
2. Create `POST /api/v1/input/simulate` endpoint that calls the pure function
3. Ensure simulate does not: persist messages, trigger memory, increment action count, call executor
4. Add `familiar.input.simulate()` to SDK
5. Update docs

## Architecture
- Keep production path clean — no simulation branches in `handleProviderConversationInput`
- Extract: intent classification → tool choice → argument extraction → reasoning
- Simulate endpoint returns identical shape + `simulated: true`

## Status
- [x] Extract decision logic — exported `decideConversationAction`, created `simulateConversationInput`
- [x] Create simulate endpoint — `POST /api/v1/input/simulate`
- [x] SDK method — `familiar.simulate({ text, channel, ... })`
- [x] Tests — types clean, 147/148 pass
- [x] Docs — quickstart, mvp-spec, api-spec, SDK README

## Commits
- f988da2 feat(api): persist provider audit logs and expose query endpoint (#31)
- [this work] feat(api): add POST /api/v1/input/simulate dry-run endpoint (#23)
