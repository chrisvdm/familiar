# 2026-03-22 Tool Confidence And Confirmation

## Summary

Added a confidence-based confirmation step to tool routing so Texty behaves more like a normal chat assistant when intent is unclear, and only hands work off when confidence is high enough.

## What Changed

- Added a confidence score to tool-call decisions in the routing model.
- Added a confidence band for tool execution:
  - below `0.60`: ask for more detail
  - `0.60` to `0.75`: ask for confirmation
  - above `0.75`: execute immediately
- Added pending tool confirmation state to thread storage.
- Added yes/no confirmation handling so a later user reply can resolve the saved tool choice.
- Tightened the routing prompt so normal conversational statements are less likely to be treated as tool requests.
- Tightened the note-tool example so extracted arguments should contain only the note value, not instruction words.

## Why

The previous behavior was too eager to call tools and too loose about argument extraction.

Examples that should behave better now:

- `my name is john`
  - should stay ordinary conversation
- `add wash hair to note`
  - should extract only `wash hair` for the note field

## Files

- `src/app/provider/provider.service.ts`
- `src/app/provider/provider.logic.ts`
- `src/app/provider/provider.logic.test.ts`
- `src/app/chat/shared.ts`
- `src/app/chat/chat.storage.ts`
- `examples/minimal-executor/texty.json`
- `examples/minimal-executor/README.md`

## Verification

- `npm test`
- `npm run types`
- `npm run build`
