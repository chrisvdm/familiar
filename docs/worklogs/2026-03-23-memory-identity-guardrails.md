# 2026-03-23 Memory Identity Guardrails

## Goal

Prevent Texty from inferring or storing incorrect gender or pronoun memory from indirect cues such as a user's name.

## Problem

The durable-memory extraction path was too permissive around identity-style facts.

In practice, this allowed the memory model to invent gendered identity facts from weak signals instead of only storing what the user explicitly said.

That is especially bad for:

- gender
- pronouns

Those facts should never be inferred from:

- a name
- relationship terms
- writing style
- any other indirect cue

## Changes

- Tightened the memory extraction system prompt in `src/app/chat/chat.memory.ts` so it now explicitly says:
  - do not infer gender, sex, or pronouns from indirect cues
  - only store gender or pronouns if the user explicitly stated them
- Added a small pure helper module in:
  - `src/app/chat/chat.memory.identity.ts`
- Added deterministic validation for extracted identity facts so:
  - `gender` is dropped unless the source user message explicitly states it
  - `pronouns` are dropped unless the source user message explicitly states them
- Added normalization for accepted explicit identity facts so values are stored consistently.
- Applied the new identity-fact guard to both:
  - extracted thread facts
  - extracted profile facts
- Updated `src/app/chat/shared.ts` so accepted `gender` and `pronouns` facts are stored in identity memory rather than falling through into the family bucket.

## Result

Texty should no longer create male pronoun or gender memory just because it saw a name and guessed.

Explicit statements such as:

- `I am female`
- `My pronouns are she/her`

can still be retained, but inferred gender/pronoun facts should now be rejected before they enter durable memory.

## Tests

Added regression coverage in:

- `src/app/chat/chat.memory.test.ts`

Covered cases:

- inferred gender from a name is dropped
- explicit gender statements are kept and normalized
- inferred pronouns are dropped
- accepted pronouns are stored under identity memory

## Verification

- `node --experimental-strip-types --experimental-specifier-resolution=node --test src/app/chat/chat.memory.test.ts`
  - passed
- `npm run types`
  - passed

Note:

- full `npm test` still has the previously existing unrelated provider execution import-resolution failure that was already identified during the MVP review
