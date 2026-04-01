# 2026-04-01 Operability Roadmap

## Summary

Defined the next post-stabilization roadmap for familiar around runtime observability, integration health, and operator UX.

## Why

Recent work made the runtime meaningfully cleaner:

- shortcuts are single-message only
- raw tools are AI-first
- memory retrieval is staged with cheaper-model selection
- hosted integration setup is clearer
- docs now better match the shipped runtime

That changes the main product bottleneck.

The biggest remaining weakness is no longer the core orchestration shape.
It is the difficulty of operating and debugging the system once an external integration is involved.

The current runtime already has request tracing and some audit-style logs, but it still lacks first-class product surfaces for:

- integration health
- event inspection
- routing/execution/delivery timelines
- thread continuity explanations
- operator-facing failure visibility

## Decision

Added a dedicated internal roadmap document at:

- `docs/operability-roadmap.md`

The roadmap is intentionally focused and staged:

1. durable runtime events
2. event inspection APIs
3. integration health
4. debugging surfaces
5. minimal operator UI
6. safe retry and replay

## Result

familiar now has an explicit internal plan for the next product phase:

- shift from “make the runtime smarter” toward “make the runtime inspectable and trustworthy”
- prioritize operator visibility before broader multi-surface complexity
- keep canonical public integration paths simple while the operational layer is being added

## Follow-up

The first implementation slice should be:

- define the event model
- persist provider/runtime events durably
- expose a minimal read API for integration and thread timelines
