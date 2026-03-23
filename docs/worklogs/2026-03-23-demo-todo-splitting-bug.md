# 2026-03-23 Demo Todo Splitting Bug

## Goal

Fix the visible todo demo so compound task text can become multiple todo items when the user would clearly expect that behavior.

## Problem

The hosted demo and the local minimal executor both supported splitting one `todo` string into multiple items, but the splitter was too narrow.

For example:

- `I need to wash my dog and buy a birthday present for my dad`

Texty correctly treated that as todo intent and asked for confirmation.
But after confirmation, the demo executor stored one combined todo because `wash` was not recognized as a task-like clause starter.

That made the failure look like a routing problem even though the bug was in executor-side decomposition.

## Changes

- Updated the hosted built-in demo executor in:
  - `src/app/provider/provider.demo.ts`
- Updated the local minimal executor in:
  - `examples/minimal-executor/executor.mjs`
- Broadened the demo todo splitter's task-verb matcher so more ordinary task clauses are recognized as separate todo items.

## Texty Vs Executor

- `Texty`
  - no routing change in this fix
  - Texty was already handling todo intent and confirmation
- `Executor`
  - changed how one confirmed `todo` payload is split into one or more visible todo items in the demo

## Result

The demo now behaves more like a user expects for common compound tasks.

The example above now produces:

- `wash my dog`
- `buy a birthday present for my dad`

instead of one merged todo string.

## Verification

- `node --check examples/minimal-executor/executor.mjs`
- `node --input-type=module -e "import { executeToolCall } from './examples/minimal-executor/executor.mjs'; const result = executeToolCall({ payload: { tool_name: 'todos.add', arguments: { todo: 'wash my dog and buy a birthday present for my dad' }, user_id: 'demo_user' } }); console.log(JSON.stringify(result, null, 2));"`
- `node --experimental-strip-types --input-type=module -e "import { executeBuiltInDemoTool } from './src/app/provider/provider.demo.ts'; const result = executeBuiltInDemoTool({ toolName: 'todos.add', args: { todo: 'wash my dog and buy a birthday present for my dad' }, userId: 'demo_user' }); console.log(JSON.stringify(result, null, 2));"`
- `npm run types`
