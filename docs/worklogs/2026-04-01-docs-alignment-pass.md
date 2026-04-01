# 2026-04-01 Docs Alignment Pass

## Context

The shipped runtime had become cleaner than the docs describing it.

Two mismatches mattered most:

- the project brief still described older memory retrieval assumptions
- some public and internal docs still described thread-persistent pinned-tool behavior even though shortcut syntax is now single-message only

That made the product feel less coherent in writing than it actually was in code.

## Change

- updated `docs/project-brief.md` to reflect:
  - hosted API and provider-backed runtime as current behavior
  - staged memory retrieval with cheap-model selection before the main model answers
  - a docs-precedence rule for resolving conflicting documentation
- updated `README.md` so the shortcut example no longer describes persistent pinned-tool behavior
- updated `src/app/docs-content/concepts.md` to replace thread-persistent pinned-tool wording with the shipped single-message shortcut model
- updated `docs/developer-ai-guidelines.md` to reinforce that current spec/brief docs outrank historical worklogs when they disagree

## Result

- the highest-signal docs now describe the shipped runtime more accurately
- shortcut behavior is documented as message-scoped instead of thread-scoped
- memory retrieval is described as staged selection rather than keyword-only recall
- the docs now make it clearer which files should be treated as current truth

## Follow-up

- finish the remaining uncommitted docs work so the public docs surface catches up with the runtime as well as the internal docs now do
- do a later pass over older worklogs and example docs to archive or annotate references to removed pinned-tool behavior

## Subsequent Cleanup

- updated the current example/docs surfaces to stop describing thread-persistent pinned-tool behavior as if it were current runtime behavior
- kept the `/sandbox/pinned-tool` route name for compatibility, but changed the surrounding copy to describe the shipped message-scoped shortcut model instead
