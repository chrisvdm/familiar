# Tool Call Trigger Fix

## Context

Tools were not being triggered by natural language requests from external developers. Investigation traced the failure to two heuristic gates in `decideConversationAction` that prevented the AI decision model from ever running for normal user messages. This worklog covers removing those gates and cleaning up the NLP heuristic functions that became dead code as a result.

## Identified the triggering bug

The `decideConversationAction` function in `provider.service.ts` had two pre-AI gates:

1. `getTodoHeuristicDecision`: a todos-specific shortcut that bypassed the AI router with regex-based intent detection.
2. `hasExplicitToolUseIntent`: a gate that required the exact tool name to appear verbatim in the user's message before the AI decision model was allowed to run. An external developer with a tool named `spreadsheet.update_row` whose user says "update the spreadsheet" would always hit a `direct_reply` — the AI model never ran.

The `@toolname` shortcut path (`parseToolShortcutInvocations`) handles explicit @-mention invocations and is a separate code path that must stay intact. The user confirmed: `@TodoList Add dogfood` is a valid explicit shortcut and is not affected by this fix.

## Identified dead NLP heuristic code

With the two gates removed, the following became dead code:

- `buildPersonalMemoryReply` in `provider.logic.ts`: regex-based name and memory recall interceptor, not called from any production path (only tested in `provider.logic.test.ts`).
- `extractPendingToolConfirmationRemainder` in `provider.logic.ts`: only used in the confirmation-remainder follow-on block (which also depended on `getTodoHeuristicDecision`). Removing that block makes this function unused.
- `hasExplicitToolUseIntent` and its supporting patterns: `EXPLICIT_TOOL_REQUEST_PATTERN`, `EXPLICIT_TOOL_REQUEST_WITH_SUBJECT_PATTERN`, `EXPLICIT_TOOL_HELP_PATTERN`, `isExplicitToolRequest`.
- All private helpers of `buildPersonalMemoryReply`: patterns, `getMostRelevantFact`, `getStoredName`, `dedupeMemoryFacts`, `getPersonalMemoryFacts`, `getExtendedMemoryFacts`, `hasRecentPersonalMemoryContext`, `formatMemoryFactForReply`, `joinMemoryPhrases`.
- `getSingleActiveTool` in `provider.service.ts`: only used to feed `getTodoHeuristicDecision`.
- `getTodoHeuristicDecision` in `provider.service.ts` (defined inline, not from logic.ts).

## Renamed TEXTY_EXECUTOR_CONFIG config label

Unified the config label in `provider.auth-core.ts` from `"TEXTY_EXECUTOR_CONFIG or TEXTY_INTEGRATION_CONFIG"` to `"TEXTY_EXECUTOR_CONFIG"` to match the MVP spec and reduce confusion.

## Implemented all removals

We made targeted deletions across four files. TypeScript confirmed clean (`npm run types`) after each change.

**`provider.auth-core.ts`**: Changed `DEFAULT_CONFIG_LABEL` to `"TEXTY_EXECUTOR_CONFIG"`.

**`provider.logic.ts`**: Removed `extractPendingToolConfirmationRemainder`, `hasExplicitToolUseIntent` with its three supporting patterns and `isExplicitToolRequest`, and the entire `buildPersonalMemoryReply` block including all private helpers (`getMostRelevantFact`, `getStoredName`, `dedupeMemoryFacts`, `getPersonalMemoryFacts`, `getExtendedMemoryFacts`, `hasRecentPersonalMemoryContext`, `formatMemoryFactForReply`, `joinMemoryPhrases`) and the four NLP patterns. Dead imports (`ChatMessage`, `flattenGlobalMemoryFacts`, `MemoryFact`, `ThreadMemory`) were also removed.

**`provider.logic.test.ts`**: Removed imports of `buildPersonalMemoryReply`, `extractPendingToolConfirmationRemainder`, `hasExplicitToolUseIntent`, and `createEmptyThreadMemory`. Removed 6 `buildPersonalMemoryReply` tests, 1 `extractPendingToolConfirmationRemainder` test, and 3 `hasExplicitToolUseIntent` tests (10 tests total).

**`provider.service.ts`**: Removed imports of `extractPendingToolConfirmationRemainder` and `hasExplicitToolUseIntent`. Removed `getSingleActiveTool` and `getTodoHeuristicDecision` function definitions. Removed the heuristic gate block from `decideConversationAction` (the `singleActiveTool`/`todoHeuristicDecision` shortcut and the `hasExplicitToolUseIntent` guard — both bypassed the AI decision model). Removed the `confirmationRemainder` follow-on block (30 lines) that depended on both removed functions. The `@toolname` shortcut path (`parseToolShortcutInvocations`) was left intact.

## Filed toolcall_id GitHub issue

Filed [#6](https://github.com/chrisvdm/familiar/issues/6) — store ToolCall records and send `toolcall_id` to executor — as a backlog item discovered during ideation in this worklog.

## Added worklog verification tests

We created `src/app/provider/provider.toolcall-trigger-fix.test.ts` with 8 tests:

- Three absence checks confirming `hasExplicitToolUseIntent`, `extractPendingToolConfirmationRemainder`, and `buildPersonalMemoryReply` are no longer exported from `provider.logic`
- Four tests confirming the `@toolname` shortcut path (`parseToolShortcutInvocation`, `parseToolShortcutInvocations`) still resolves tools correctly, including dot-namespaced names (`todos.add`) and multi-mention messages
- One test confirming `interpretPendingToolConfirmation` (confirm/reject/unknown) is unaffected

All 8 pass.

## Manual verification — passed

Tested against the minimal-executor sandbox:

- **Implicit tool calls**: natural language ("buy dog food") routed correctly to `todos.add` and executed. `execution.state: completed`.
- **Explicit @mention calls**: `@TodoList Add dogfood` style still resolved correctly via the shortcut path.
- **Memory**: name and pet fact storage and recall working as expected after the gate removal. No regression from global-memory-v2 fixes.

Routing model flow in local dev: Cloudflare Llama 3.1 8B throws on `json_schema` mode (error 5024) and falls back to OpenRouter `gpt-4o-mini` with `response_format: json_object`, which returns valid JSON. Production Cloudflare Workers AI behaviour may differ.

Worklog closed.