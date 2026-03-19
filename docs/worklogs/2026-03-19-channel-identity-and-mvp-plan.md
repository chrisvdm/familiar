# 2026-03-19 Channel Identity And MVP Plan

## Goal

Capture two clarified architecture decisions:

- channels should act as linked identities for one provider/user pair
- the first provider-aware MVP should be scoped and sequenced explicitly

## Changes

- Updated `docs/conversation-lifecycle.md` to define:
  - channel-linked identity
  - refined thread resolution when `thread_id` is missing
- Updated `docs/data-model.md` to add `Channel Identity`
- Updated `docs/provider-api-spec.md` to include channel context and the refined thread-resolution rule
- Added `docs/mvp-plan.md`

## Outcome

The docs now state clearly that:

- shared memory continuity is user-level
- recent-thread continuity is channel-level
- `thread_id` wins when supplied
- otherwise Texty should prefer the most recent thread for that channel when the new content fits it, and infer or create a new thread when it does not

The project also now has an explicit first-pass MVP definition instead of only high-level architecture direction.
