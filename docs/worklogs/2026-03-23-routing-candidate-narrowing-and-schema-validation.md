# 2026-03-23 Routing Candidate Narrowing And Schema Validation

## Goal

Improve Texty routing and extraction reliability with a general system change rather than adding more prompt-specific fixes.

## Problems

Two reliability issues were still prominent:

1. the routing model always saw the full active tool list
2. Texty could still proceed with a tool path even when required schema fields were missing, relying too much on model behavior alone

That made routing more prompt-sensitive than it needed to be.

## Changes

### Candidate-tool narrowing

Updated `src/app/provider/provider.service.ts` so Texty now:

- scores active tools against the current user message
- narrows the prompt to the most relevant candidate tools before asking the routing model to choose

This is a lightweight deterministic relevance filter, not vector search yet.

### Schema-aware required-field validation

Updated:

- `src/app/provider/provider.logic.ts`
- `src/app/provider/provider.service.ts`

to add deterministic required-field checks after extraction.

Texty now:

- reads required fields from the synced `input_schema`
- checks whether extracted arguments contain meaningful values
- converts incomplete tool decisions into follow-up questions instead of treating them as executable

This applies both to:

- initial tool decisions
- follow-up argument updates

### Better prompt guidance and follow-up wording

Updated `src/app/provider/provider.service.ts` so Texty now:

- gives the routing model clearer negative guidance for ordinary statements versus actionable requests
- includes additional examples for common false-positive cases such as:
  - `I want to retire`
  - `I think I will buy Canidae`
- builds follow-up questions from schema field descriptions when available instead of only using raw property names

## Result

This reduces two common failure modes:

- wrong tools being considered when many tools are active
- incomplete arguments slipping through as executable tool calls
- awkward or overly technical follow-up wording when required fields are missing

The routing stack is still model-assisted, but it is now more constrained by deterministic logic.

## Verification

- `node --experimental-strip-types --experimental-specifier-resolution=node --test src/app/provider/provider.logic.test.ts`
- `npm run types`
