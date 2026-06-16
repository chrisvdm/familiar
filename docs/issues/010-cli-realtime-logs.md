# CLI realtime log tail

**Priority:** 🟡 High  
**Blocked by:** None

## Problem

Today there is no easy way for an operator to watch *familiar* runtime logs from the CLI. Debugging a deployed worker means:

- Opening the Cloudflare dashboard
- Finding the worker
- Clicking into the tail/log view

This breaks the CLI-first workflow.

## Acceptance Criteria

- [ ] Add `familiar logs` (or `familiar tail`) command to the CLI.
- [ ] The command streams worker logs in real time, similar to `wrangler tail`.
- [ ] It authenticates using the same token resolution as other CLI commands (`--token`, `.dev.vars`, `~/.familiar/config.json`).
- [ ] It supports a `--filter` option for event names or status codes (optional nice-to-have).
- [ ] The command works against both local dev and hosted deployments via `--host`.

## Notes

Wrangler already exposes `wrangler tail`. The CLI could either:

1. Shell out to `wrangler tail` if Wrangler is authenticated locally.
2. Call a new lightweight `/api/v1/logs/stream` endpoint that forwards tail events (more complex).

Option 1 is simpler and keeps the worker surface small. Option 1 still requires the user to have Wrangler authenticated, which is already true for deployments.

## Related

- `packages/cli/familiar.mjs`
- `docs/worklogs/2026-06-05-cli-dashboard-parity.md`
