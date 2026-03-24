# 2026-03-24 Pinned Tool Example

## Goal

Add a standalone example for the `@[tool-name]` flow so the pinned tool behavior can be tested end to end, separate from the todo and async callback demos.

## Changes

- Added `examples/pinned-tool` with:
  - `notes.capture`
  - `ideas.capture`
  - a local executor server
  - a browser UI for entering, continuing, exiting, and switching pinned tools
- Updated the top-level README so the pinned tool example is discoverable alongside the existing examples.

## Result

Texty now has a dedicated example for the pinned tool behavior, which makes it easier to validate the `@[tool-name]` flow without mixing it into the todo or async countdown demos.

## Verification

- `node --check examples/pinned-tool/server.mjs`
- `node --check examples/pinned-tool/executor.mjs`
