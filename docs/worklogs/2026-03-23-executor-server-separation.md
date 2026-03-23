# 2026-03-23 Executor Server Separation

## Goal

Make the minimal executor example easier to read by separating executor logic from the HTTP server code.

## Problem

The previous local example mixed:

- HTTP routing
- auth checks
- JSON parsing
- executor business logic
- in-memory todo handling

inside one file.

That made it harder to see the actual executor contract clearly.

## Changes

- Added `examples/minimal-executor/executor.mjs`
  - exports the tool definitions
  - exports the executor function that handles a Texty tool call payload
- Simplified `examples/minimal-executor/server.mjs`
  - server code now focuses on:
    - auth
    - request parsing
    - routing
    - calling the executor module
- Updated `examples/minimal-executor/README.md`
  - documented the split
  - pointed readers directly at `executor.mjs` when they want the cleanest view of the executor API shape

## Result

The minimal example now reads more cleanly:

- `server.mjs` shows transport concerns
- `executor.mjs` shows the executor implementation

That makes the example better for someone trying to understand what Texty sends to an external executor and what the executor is expected to return.

## Verification

- `node --check examples/minimal-executor/server.mjs`
- `node --check examples/minimal-executor/executor.mjs`
