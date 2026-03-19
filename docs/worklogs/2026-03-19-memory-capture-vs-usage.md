# 2026-03-19 Memory Capture Vs Usage

## Scope

- Clarify the intended memory rule for Texty.
- Separate memory capture from memory usage in the architecture docs.

## Completed

- Updated `docs/architecture-foundations.md` to define:
  - default memory capture for all non-private conversations
  - private threads as the explicit exception
  - provider-controlled retrieval and usage on top of that captured memory
- Updated `docs/provider-api-direction.md` so provider behavior is framed as memory usage policy rather than memory capture policy.
- Updated `docs/project-brief.md` to reflect the intended capture-first rule.
- Clarified that retrieval modes like `none`, `thread`, `provider_user`, `custom_scope`, and `external` do not disable default capture for normal conversations.

## Notes

- The intended rule is now:
  - Texty captures memory by default
  - private threads are excluded from shared memory capture
  - providers decide how much captured memory they retrieve and use
