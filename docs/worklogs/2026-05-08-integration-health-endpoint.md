# Worklog: Add GET /api/v1/integration/health endpoint

## Date
2026-05-08

## Issue
- Integration health monitoring (operability roadmap Phase 3)

## Goal
Make integration readiness and reachability obvious before users hit failures.

## Plan
1. Add `getProviderHealth` function that inspects the provider context and audit log
2. Wire `GET /api/v1/integration/health` route
3. Add SDK `familiar.integration.health()`
4. Update docs

## Architecture
- Passive health from observed audit events (no active probes in MVP)
- Looks at last 24 hours of events
- Counts tool execution failures and delivery failures
- Returns `overall: "healthy" | "warning" | "degraded"`

## Status
- [x] `getProviderHealth` function
- [x] Route wired
- [x] SDK method
- [x] Docs updated
- [x] Tests pass — 147/148

## Commits
- [this work] feat(api): add GET /api/v1/integration/health endpoint
