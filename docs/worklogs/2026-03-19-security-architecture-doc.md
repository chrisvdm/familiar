# 2026-03-19 Security Architecture Doc

## Goal

Document the current security model and the target auth/tenancy requirements clearly enough that a new contributor can understand what Texty protects today and what still needs to be built before Texty becomes a real external service.

## Changes

- Added `docs/security-architecture.md`.
- Documented:
  - current browser-session security model
  - target provider/user authentication model
  - tenant isolation requirements
  - private-thread enforcement requirements
  - webhook verification requirements
  - rate limiting, audit logging, secret handling, and data lifecycle expectations
- Linked the new security doc from:
  - `README.md`
  - `docs/project-brief.md`
  - `docs/architecture-foundations.md`

## Outcome

The docs now distinguish more clearly between:

- the current browser-session prototype security boundary
- the target multi-tenant provider service security boundary

This closes a major documentation gap around authentication, tenancy, and minimum production security controls.
