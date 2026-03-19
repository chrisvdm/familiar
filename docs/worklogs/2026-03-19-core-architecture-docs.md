# 2026-03-19 Core Architecture Docs

## Goal

Close the biggest remaining documentation gaps by defining:

- how a conversation turn moves through Texty
- the core data entities Texty depends on
- the target provider-facing API contract

## Changes

- Added `docs/conversation-lifecycle.md`
- Added `docs/data-model.md`
- Added `docs/provider-api-spec.md`
- Updated `README.md` to link the new documents
- Updated `docs/project-brief.md` with a fuller source-of-truth reference list
- Updated `docs/architecture-foundations.md` to point to the lifecycle and data-model references

## Outcome

The docs now cover:

- high-level product direction
- identity and memory-policy model
- security/auth direction
- conversation flow
- core entities
- target provider API contract

This makes the project much easier to understand and much more recoverable if implementation changes significantly later.
