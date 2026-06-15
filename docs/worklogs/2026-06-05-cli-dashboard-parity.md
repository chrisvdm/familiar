# CLI Dashboard Parity

## Context

The web-based account dashboard currently provides integration health, usage, audit events, threads, and token management. The operator workflow is moving to CLI-first, but the web dashboard code and `BrowserSession` infrastructure must remain available for future CLI-to-web login flows.

## Decisions

### Decision 1: Keep web dashboard code intact

**Chosen:** Add CLI equivalents for dashboard features without removing the web dashboard, `/setup/*`, `/auth/browser`, or `BrowserSessionDurableObject`.

**Motivation:** A future CLI-to-web login flow will need the browser session machinery. Removing it now would force a rewrite later. The web UI can stay dormant while CLI becomes the primary operator surface.

### Decision 2: CLI commands mirror dashboard sections

**Chosen:** Add `familiar integration health`, `familiar account usage`, `familiar audit events`, `familiar threads list`, and token management commands.

**Motivation:** Each dashboard card becomes a single CLI command, making automation and scripting easier.

## Implementation

- Issue #57 tracks the full parity checklist.
- Added read-only dashboard commands to the CLI:
  - `familiar integration health`
  - `familiar integration status`
  - `familiar account usage`
  - `familiar audit events [--limit <n>]`
  - `familiar threads list [--user-id <id>]`
- Existing `/api/v1/*` endpoints are reused; no backend changes required for these commands.
- Token management still needs new backend endpoints if/when it is exposed.
