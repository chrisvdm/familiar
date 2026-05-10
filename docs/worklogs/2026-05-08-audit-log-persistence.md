# Worklog: Persist provider audit logs and expose query endpoint (#31)

## Date
2026-05-08

## Issue
- #31: Persist provider audit logs and expose query endpoint

## Goal
Make runtime state first-class by persisting provider audit events and exposing them via API + SDK.

## Plan
1. Add `auditLog` field to `ProviderUserContext` type
2. Create `appendProviderAuditEvent` that loads context, appends event, caps at 100, saves
3. Add `GET /api/v1/audit/events` endpoint
4. Add `familiar.audit.events()` to SDK
5. Update docs

## Architecture decisions

### Storage
- Store audit logs in `ProviderUserContextDO` alongside threads, tools, memory
- Cap at 100 most recent events (simple array shift)
- Each event: `{ event, requestId, status, code, detail, metadata, at }`

### Scope
- Per-integration-user (same as threads/tools)
- Accessible via bearer token (same auth as other endpoints)

## Status
- [x] Type changes — `auditLog` added to `ProviderUserContext`
- [x] Audit persistence function — `appendProviderAuditEvent` in `provider.storage.ts`
- [x] API endpoint — `GET /api/v1/audit/events` with `status` and `limit` query params
- [x] SDK method — `familiar.audit.events({ status?, limit? })`
- [x] Tests — fixed test helpers to include `auditLog`
- [ ] Docs

## Commits
- TBD
