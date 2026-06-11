# Provider Monolith Breakdown

## Summary

Broke down `provider.service.ts` from 2988 lines to ~542 lines by extracting six focused modules. All 234 tests remain passing. No behavioral changes — purely structural refactoring.

## Motivation

`provider.service.ts` had grown to nearly 3000 lines, mixing concerns:
- AI client initialization
- LLM decision-making
- Tool execution
- Thread lifecycle management
- Memory refresh/synthesis
- Rate limiting
- Tool argument normalization

This made the file hard to navigate, test, and reason about. It also violated the project's goal of keeping files under 500 lines where possible.

## Extracted Modules

| Module | Lines | Responsibility |
|--------|-------|----------------|
| `ai-client.ts` | ~359 | `AiClient` interface, default + mock implementations, error diagnostics |
| `provider.decision.ts` | ~522 | Pure decision-making logic: `createDecideConversationAction`, `callDecisionModel`, `tokenize`, `parseJsonObject` |
| `provider.conversation.ts` | ~1604 | Input handlers: `handleProviderConversationInput`, `handleStreamConversationInput`, `simulateConversationInput`, `executeProviderTool` |
| `provider.threads.ts` | ~553 | Thread CRUD, channel state, `getProviderHydratedState`, `buildChannelKey` |
| `provider.memory-runtime.ts` | ~148 | `refreshProviderMemories`, `runProfileSynthesis`, synthesis guards |
| `provider.tool-helpers.ts` | ~237 | `normalizeToolArguments`, todo extraction, confirmation question builders |
| `provider.rate-limit.ts` | ~70 | `ProviderRateLimitError`, rate limit enforcement |

## Key Patterns

- **Factory pattern**: `createDecideConversationAction({ aiClient })` and `createDefaultAiClient(env?)` allow test injection while preserving existing call sites.
- **Module boundary rule**: Testable modules (`ai-client.ts`, `provider.decision.ts`, `provider.logic.ts`, etc.) must not import `cloudflare:workers`. Only runtime-bound modules (`provider.service.ts`, `provider.threads.ts`, `provider.conversation.ts`, `provider.memory-runtime.ts`) may do so.
- **Env caching**: `createDefaultAiClient()` reads all env vars once at module init instead of per-call.

## Risks Mitigated

- Import fixes applied across all endpoint files
- `.ts` extensions normalized on all relative imports in extracted modules
- `provider.service.ts` retains backward-compatible re-exports for any external callers

## Remaining

Pre-existing TS errors in `account.models.http.ts` and unmodified code still present (not introduced by refactor).
