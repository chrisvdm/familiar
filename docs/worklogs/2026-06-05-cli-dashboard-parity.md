# CLI Dashboard Parity

## Context

The web-based account dashboard currently provides integration health, usage, audit events, threads, and token management. The operator workflow is moving to CLI-first, but the web dashboard code and `BrowserSession` infrastructure must remain available for future CLI-to-web login flows.

## Decisions

### Decision 1: Keep web dashboard code intact

**Chosen:** Add CLI equivalents for dashboard features without removing the web dashboard, `/auth/browser`, or `BrowserSessionDurableObject`. The `/setup` frontend page was removed and now redirects to `/docs/cli`, but `POST /setup/create` and the browser session machinery remain for future CLI-to-web login flows.

**Motivation:** CLI is now the primary operator surface. Removing the `/setup` page steers new users to `familiar init`, while keeping the browser session machinery avoids a rewrite later.

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
- Added token management commands to the CLI and SDK:
  - `familiar tokens list` → `GET /api/v1/tokens`
  - `familiar tokens create` → `POST /api/v1/tokens`
  - `familiar tokens revoke <token-id>` → `DELETE /api/v1/tokens/:tokenId`
- Backend changes:
  - New `AccountRegistry` DO methods: `issueToken`, `listTokens`, `revokeToken`.
  - New service helpers: `createAccountToken`, `listAccountTokens`, `revokeAccountToken`.
  - New endpoint factories in `account.tokens.http.ts`: `createHandleTokensEndpoint` and `createHandleRevokeTokenEndpoint`.
  - Wired routes in `account.routes.ts`:
    - `GET /api/v1/tokens`
    - `POST /api/v1/tokens`
    - `DELETE /api/v1/tokens/:tokenId`
- The full token value is returned only on creation; list and revoke expose only the prefix and last four characters.
- Revocation sets `revokedAt` on the token record; the hashed token remains in storage for audit purposes but is no longer valid for auth.
