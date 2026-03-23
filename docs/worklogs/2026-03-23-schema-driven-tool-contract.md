# 2026-03-23 Schema-Driven Tool Contract

## Goal

Align the documentation and demo implementation with the intended Texty contract:

- `texty.json` is the sync manifest
- tool schemas define the exact argument shape Texty must produce
- Texty owns argument extraction and clarification
- executors receive validated arguments and perform the side effect

## Problem

The docs already leaned in this direction, but the visible todo demo still taught the wrong mental model in a few places.

In particular:

- the demo manifest and example schema used a single `todo` string
- the executor split natural-language task strings into multiple items
- that made the executor look responsible for argument interpretation instead of Texty

That was inconsistent with the intended product model.

## Documentation Changes

- Updated `README.md`
  - defined `texty.json` as the sync contract
  - clarified that Texty should satisfy `input_schema` before execution
  - clarified that executors should receive validated `arguments` plus optional metadata
- Updated `docs/ai-integration-direction.md`
  - made `texty.json` part of the happy-path integration story
  - stated that schema ownership belongs in Texty
- Updated `docs/provider-api-direction.md`
  - clarified that Texty extracts schema-valid arguments
  - updated the execution payload example to show `arguments` plus metadata
- Updated `examples/minimal-executor/README.md`
  - made `texty.json` the source of truth for the example
  - clarified that `todos.add` expects `todo_items: string[]`

## Runtime Changes

- Updated `examples/minimal-executor/texty.json`
  - changed `todos.add` from `todo: string` to `todo_items: string[]`
- Updated `examples/minimal-executor/executor.mjs`
  - executor now imports tool definitions from `texty.json`
  - executor now expects `todo_items`
  - executor no longer performs multi-item natural-language decomposition
- Updated `src/app/provider/provider.demo.routes.ts`
  - hosted demo sync now uses the manifest schema
- Updated `src/app/provider/provider.service.ts`
  - todo heuristics now produce `todo_items`
  - prompt guidance now explicitly tells the model to respect array-shaped schemas
  - todo argument normalization now keeps the schema in Texty
- Updated `src/app/provider/provider.demo.ts`
  - built-in demo executor now expects `todo_items`

## Texty Vs Executor

- `Texty`
  - chooses the tool
  - extracts schema-valid arguments
  - asks follow-up questions when required fields are missing
- `Executor`
  - accepts the validated payload
  - performs the side effect
  - returns execution status and result data

## Result

The docs and demo now point at the same intended model:

- users talk to Texty
- `texty.json` defines the contract
- Texty turns user language into schema-valid arguments
- the executor just does the work

## Verification

- `node --check examples/minimal-executor/executor.mjs`
- `node --check examples/minimal-executor/server.mjs`
- `node --input-type=module -e "import { executeToolCall } from './examples/minimal-executor/executor.mjs'; const result = executeToolCall({ payload: { tool_name: 'todos.add', arguments: { todo_items: ['wash my dog', 'buy milk'] }, user_id: 'demo_user' } }); console.log(JSON.stringify(result, null, 2));"`
- `node --experimental-strip-types --experimental-specifier-resolution=node --test src/app/provider/provider.logic.test.ts`
- `npm run types`
