# 2026-03-19 Architecture Foundations

## Scope

- Write down the core architectural model for Texty so the project is recoverable and design decisions do not drift.
- Clarify identity semantics, storage boundaries, and memory policy behavior.

## Completed

- Added `docs/architecture-foundations.md` covering:
  - Texty vs provider responsibilities
  - the meaning of `provider_id`
  - the meaning of `user_id`
  - thread/user/global storage concepts
  - the distinction between current implementation and intended implementation
  - memory policy modes:
    - `none`
    - `thread`
    - `provider_user`
    - `custom_scope`
    - `external`
- Linked the new architecture doc from:
  - `README.md`
  - `docs/project-brief.md`
  - `docs/provider-api-direction.md`

## Notes

- This is a design-direction document, not a statement that all of these storage and identity boundaries already exist in code.
- The current implementation is still browser-session scoped in important places; this document describes the target model Texty should move toward.
