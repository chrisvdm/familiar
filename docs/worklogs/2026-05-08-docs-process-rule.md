# Worklog: Docs process rule — API changes need both internal and user-facing docs

## Date
2026-05-08

## Scope
Add a standing convention that every API change or new feature must be documented in both internal docs (for maintainers) and user-facing docs (for developers integrating with familiar).

## Change
Updated `docs/blueprints/developer-ai-guidelines.md`:

> **API changes and new features must be documented in both internal docs and user-facing docs.** Internal docs capture the "what" and "how" for maintainers. User-facing docs (quickstart, API reference, SDK docs) explain the "why" and "how to use it" for developers integrating with familiar. Never ship an API change without updating both.

## Rationale
- We just shipped `GET /api/v1/account/usage` (#16), `GET /api/v1/integration/status` (#18), and SDK updates without updating the public quickstart or API reference docs
- This creates a gap where the server has features that developers don't know about
- The new rule ensures future API work includes docs as part of the definition of done

## Status
- [x] Rule added to developer-ai-guidelines.md
- [x] Committed

## Follow-up
- Update `docs/blueprints/provider-quickstart.md` to document the new endpoints
- Update `docs/blueprints/provider-api-spec.md` to include `GET /api/v1/integration/status`
- Update SDK README in the main docs site if it's mirrored there
