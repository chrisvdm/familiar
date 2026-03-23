# 2026-03-23 Visible Todo Demo Example

## Goal

Make the public minimal executor example easier to understand by showing a visible side effect in the browser instead of making the user inspect raw response JSON to see what happened.

## Problem

The previous example used a fake note-saving tool.

That worked as a minimal executor, but the main effect was buried in structured API output.

For a product demo, that is weak because:

- the user has to read JSON to understand the result
- the tool side effect is not visually obvious
- the example feels more like API plumbing than a conversation product

## Changes

- Replaced the example tool with:
  - `todos.add`
- Updated the example executor in `examples/minimal-executor/server.mjs` so:
  - it keeps a small in-memory todo list per demo user
  - the tool adds one todo item when Texty calls it
  - the tool returns clarification if the todo text is missing
- Updated the playground route so the browser now receives:
  - the latest assistant reply
  - task metadata
  - the current todo list
  - the observed sync/input responses for debug

## UI Changes

Updated `examples/minimal-executor/index.html` so the example now behaves like a small product demo instead of a raw API console.

New layout:

- conversation area on the left
- visible todo list on the right
- raw JSON moved behind debug details

Other adjustments:

- added example prompt buttons
- updated the copy to describe visible todo state
- kept request/response JSON available, but secondary

## Documentation Changes

Updated:

- `examples/minimal-executor/README.md`
- `examples/minimal-executor/texty.json`

The example docs now explain the demo as:

- a Texty-driven conversation
- one external tool
- one visible todo list state change

rather than:

- a note echo endpoint with output mainly inspected through response payloads

## Result

The example now demonstrates the Texty product story more clearly:

- the user says something natural
- Texty decides whether work should happen
- the executor performs the side effect
- the changed state is visible immediately in the UI

That makes it much easier to understand how user language affects external state through Texty.

## Verification

- `node --check examples/minimal-executor/server.mjs`
  - passed
- reviewed the example files for stale `notes.echo` references
