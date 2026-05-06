# Browser-Assisted CLI Login
<!-- gh issue #14 -->

## Context

`familiar init` always creates a new account and issues the first token. There is no `familiar login` — no way to connect an existing account to the CLI, and no way to reuse a known account on a new machine without manually copying a token.

The blueprint (`docs/blueprints/auth-onboarding-direction.md`) already describes this flow as "Browser-Assisted CLI Login" and defines the intended model. This worklog is the first step toward making it real.

---

## What the blueprint already defines

The blueprint defines two account states:

- **Provisional account** — exists without a human owner login. Created by `familiar init` today.
- **Claimed account** — has at least one authenticated human user attached to it.

And a browser-assisted CLI login shape:

1. CLI starts a login flow
2. CLI opens a browser window
3. Browser authenticates the human (Google or passkey)
4. App links that human to an existing provisional account or creates a new claimed one
5. App returns or issues a machine-usable API token
6. CLI stores that token

The blueprint also says: the long-lived credential stays on the local machine as an API token. The browser claim bridge is short-lived.

---

## Current state

- No Google login, no passkey, no user identity model beyond the account + token.
- `/setup` creates a new account and shows the token. No login for existing accounts.
- `FamiliarAccount` has no `ownerId`, no `claimed` flag, no user identity at all.
- The account registry DO (`AccountRegistryDurableObject`) stores accounts, integrations, and tokens — nothing about human users.
- `familiar init` → `POST /api/v1/accounts` → new token. No "link to existing" path.

---

## Ideation

The full blueprint design (Google/passkey + provisional → claimed lifecycle) is the right destination, but it requires human identity infrastructure that does not exist yet. Before committing to that, we should map out which slice is useful now.

### Option A — Session bridge (near-term, no Google/passkey)

The CLI generates a short-lived `session_id`, opens the browser to `/auth/cli?session=<id>`, and polls for a result.

```
familiar login
  → generate session_id
  → open browser: /auth/cli?session=<id>
  → poll GET /api/v1/auth/cli/<session_id> every 2s
  → browser page: user clicks "Create account" or "Use existing token"
  → browser POSTs token to /api/v1/auth/cli/<session_id>/complete
  → CLI receives token from poll response
  → CLI stores token
```

**What this enables**: the token makes it to the CLI without copy-paste. The "human verification" step is just opening the browser (proof of intent, not identity). Google/passkey can be added to the browser step later without changing the CLI or the polling protocol.

**What it does not do**: it does not authenticate the human or link to an existing account. If the user clicks "Create account" in the browser, it's a new provisional account — same as `familiar init`, just with a nicer handoff.

**Where it gets interesting**: if the browser page can show an existing token (e.g. from a cookie or local storage in the browser) and the user can select it, then this becomes a real "get my existing token into CLI" flow without needing Google/passkey. The browser already has the token because the user used the setup page before.

**Server-side needs:**
- Temporary session store for `session_id → token` mapping. Likely a new Durable Object or a TTL-keyed entry in the existing account registry.
- `POST /api/v1/auth/cli/:session_id/complete` — browser calls this with the token
- `GET /api/v1/auth/cli/:session_id` — CLI polls this until token is ready or expired
- `/auth/cli` page in the web app — a minimal browser page for the handoff

**CLI command:**
- `familiar login` — starts the flow
- `familiar login --token <token>` — manual import shortcut (skip browser)

### Option B — Manual import only (simplest)

No browser handoff. Just add `familiar login --token <token>` as a named alternative to `familiar init`:

```shell
familiar login --token fam_abc123
```

Saves the token to the local config. No polling, no session bridge, no browser page.

**What this enables**: a user who already has a token can get it into the CLI without creating a new account. Does not solve the "get to the token without copy-paste" problem.

**What it does not do**: does not open a browser, does not connect to an existing account without copy-paste.

### Option C — Full blueprint design

Implement the full provisional → claimed account model with Google login or passkey. This requires:

- Human user identity model (not in the account types today)
- Google OAuth or passkey registration + authentication
- Browser session management
- Account claiming flow

This is the right long-term destination but is a larger scope and depends on infrastructure that does not exist.

---

## Direction agreed

- **Option A** (session bridge, polling, browser handoff) — full implementation
- **Option B** (`familiar login --token <token>`) — included alongside as a manual shortcut
- **Browser page** surfaces an existing token from localStorage if the user previously went through `/setup`, and also creates a new account if no prior token exists — in both cases, the result flows back to the CLI via the session bridge
- Google/passkey deferred — the browser step today is "click a button", but the polling protocol is designed to accept richer auth later without changing the CLI or the server contract

---

## RFC

### 2000ft View

`familiar login` is a new CLI command that starts a browser-assisted auth flow. The CLI generates a short-lived session ID, opens the browser, and polls the server until the browser completes the handoff. The browser page checks localStorage for a token from a prior `/setup` visit — if found, the user can connect that account in one click. If no prior token exists, the page creates a new account, stores the token in localStorage, and completes the session. Either way, the CLI receives a valid token, stores it, and exits.

`familiar login --token <token>` is a direct import shortcut for the case where the user already has a token in hand.

No Google or passkey is required for this slice. The browser step is the human verification — proof the same person who opened the CLI also opened the browser. Richer identity can be added to the browser step later without changing the CLI or the polling API.

### Behavior Spec

**GIVEN** no prior token exists in CLI config or browser localStorage  
**WHEN** `familiar login` is run  
**THEN** a browser opens to `/auth/cli?session=<id>`, the page offers "Create account and connect", the user clicks, a new account is created, the token is stored in browser localStorage, the session is completed, and the CLI stores the token and prints "Logged in."

**GIVEN** a token exists in browser localStorage from a prior `/setup` visit  
**WHEN** `familiar login` is run  
**THEN** the browser page shows "You have an existing account [prefix···last4]" with a "Use this account" button, the user clicks, the existing token is sent to complete the session, and the CLI stores it and prints "Logged in."

**GIVEN** `familiar login --token fam_abc123` is run  
**WHEN** the token is provided directly  
**THEN** the token is saved to the local config with no browser interaction, and the CLI prints "Token saved."

**GIVEN** the session expires (10 minutes) before the browser completes it  
**WHEN** the CLI polls the expired session  
**THEN** the CLI prints "Login expired. Run `familiar login` to try again." and exits 1.

**GIVEN** `cloudflared` or the network is unavailable — this flow does not use the tunnel, so this case does not apply.

### API Reference

#### `POST /api/v1/auth/cli/sessions`
No auth required. Creates a CLI session.

Request: `{}`

Response:
```json
{ "session_id": "cli_a1b2c3d4e5f6..." }
```

#### `GET /api/v1/auth/cli/sessions/:session_id`
No auth required. CLI polls this.

Pending response:
```json
{ "state": "pending" }
```

Completed response:
```json
{ "state": "completed", "token": "fam_abc123" }
```

Expired response:
```json
{ "state": "expired" }
```

#### `POST /api/v1/auth/cli/sessions/:session_id/complete`
No auth required. Browser calls this after the user takes action.

Request:
```json
{ "token": "fam_abc123" }
```

Response:
```json
{ "ok": true }
```

The endpoint validates the token exists in the account registry before accepting it. Rejects unknown tokens with 400.

### Implementation Breakdown

**`src/app/account/account.types.ts`** `[MODIFY]`
- Add `CliSession` type: `{ sessionId: string; tokenValue?: string; expiresAt: string }`
- Add `cliSessions: Record<string, CliSession>` to `FamiliarAccountRegistryState`

**`src/app/account/account-registry-state.ts`** `[MODIFY]`
- Normalize `cliSessions` to `{}` on existing records
- Add lazy pruning: on session creation, remove expired entries

**`src/app/account/account-registry-do.ts`** `[MODIFY]`
- `createCliSession(sessionId)` — stores new session with 10-minute TTL
- `completeCliSession(sessionId, tokenValue)` — validates token exists in registry, sets `tokenValue`
- `pollCliSession(sessionId)` — returns `pending | completed | expired`

**`src/app/account/account.http-core.ts`** `[MODIFY]`
- Handle `POST /api/v1/auth/cli/sessions`
- Handle `GET /api/v1/auth/cli/sessions/:session_id`
- Handle `POST /api/v1/auth/cli/sessions/:session_id/complete`

**`src/app/account/account.routes.ts`** `[MODIFY]`
- Register the three new routes

**`[NEW] src/app/pages/auth-cli.tsx`** + **`[NEW] src/app/pages/auth-cli.client.tsx`**
- Server page: renders the CLI auth page at `/auth/cli?session=<id>`
- Client component:
  - Reads `session` from URL params
  - Reads `familiar_token` from localStorage
  - If found: shows token prefix + "Use this account" button
  - If not found: shows "Create account and connect" button
  - On action: calls `POST /api/v1/auth/cli/sessions/:id/complete` with the token
  - Shows success: "Your CLI is now connected. You can close this tab."
  - Shows error if session is expired or token is rejected

**`src/app/pages/setup.client.tsx`** `[MODIFY]`
- After successful account creation, store token in localStorage:
  `localStorage.setItem("familiar_token", JSON.stringify({ value, prefix, lastFour, createdAt }))`

**`src/worker.tsx`** `[MODIFY]`
- Register `/auth/cli` route

**`packages/cli/familiar.mjs`** `[MODIFY]`
- Add `familiar login` command:
  - `POST /api/v1/auth/cli/sessions` → get `session_id`
  - Open browser: `open https://familiar.../auth/cli?session=<id>` (use `open` on macOS, `xdg-open` on Linux, `start` on Windows)
  - Poll `GET /api/v1/auth/cli/sessions/<id>` every 2s, up to 5 minutes
  - On completed: save token to local config, print "Logged in."
  - On expired: print error, exit 1
- Add `familiar login --token <token>` shortcut:
  - Validate token starts with `fam_` (basic sanity check)
  - Save to config, print "Token saved."
- Update help text

### Directory & File Structure

```
src/app/account/
  account.types.ts              ← add CliSession, cliSessions to state type
  account-registry-state.ts     ← normalize + lazy prune cliSessions
  account-registry-do.ts        ← createCliSession, completeCliSession, pollCliSession
  account.http-core.ts          ← three new route handlers
  account.routes.ts             ← register routes

src/app/pages/
  auth-cli.tsx                  ← new server page
  auth-cli.client.tsx           ← new client component
  setup.client.tsx              ← store token to localStorage on create

src/worker.tsx                  ← register /auth/cli route

packages/cli/familiar.mjs       ← familiar login command
```

### Types

```typescript
type CliSession = {
  sessionId: string;
  tokenValue?: string;
  expiresAt: string; // ISO timestamp
};

// FamiliarAccountRegistryState gains:
cliSessions: Record<string, CliSession>;
```

### Invariants & Constraints

- Session TTL is 10 minutes. The CLI times out after 5 minutes with a clear error.
- `completeCliSession` must validate the token exists in the registry before accepting it. Unknown tokens return 400.
- Session IDs are random (UUID v4 or equivalent). They are not guessable.
- The full token value is stored in the session record only until the CLI polls and receives it. After that it is not cleared server-side (session expiry handles cleanup). The window is short.
- `familiar login --token` does a basic format check (`fam_` prefix) but does not make a network call to validate. The token will fail on the first API call if invalid.
- The browser page never shows the full token value — only prefix and last four characters.
- localStorage key: `familiar_token`, value is JSON with `{ value, prefix, lastFour, createdAt }`.
- No auth header is required on any of the three CLI session routes. They are authenticated by knowledge of the session_id (for poll/complete) and the token (for complete).

### Suggested Verification

```bash
# 1. Run familiar login — confirm browser opens
familiar login --host http://localhost:5173

# 2. In the browser page — confirm localStorage token is surfaced if /setup was used before
# 3. Click "Use this account" — confirm CLI prints "Logged in."
# 4. Check stored token: cat ~/.codex/familiar/config.json

# 5. Test manual import
familiar login --token fam_abc123

# 6. Test expiry: POST a session, wait 10 min, poll — confirm expired state
```

### Tasks

- [x] Add `CliSession` type and `cliSessions` to `FamiliarAccountRegistryState`
- [x] Normalize `cliSessions` in `account-registry-state.ts`
- [x] Add `createCliSession`, `completeCliSession`, `pollCliSession` to registry DO
- [x] Add three route handlers in `account.http-core.ts`
- [x] Register routes in `account.routes.ts`
- [x] Create `auth-cli.tsx` + `auth-cli.client.tsx`
- [x] Update `setup.client.tsx` to store token in localStorage
- [x] Register `/auth/cli` route in `src/worker.tsx`
- [x] Add `familiar login` command to `familiar.mjs`
- [x] Update help text in `familiar.mjs`

## Implementation complete

Implemented the full browser-assisted CLI login flow across all layers. Token validation in `completeCliSession` delegates to `authenticateAccountToken` in the service layer — the DO method stores the pre-validated raw token value. The `AccountEndpointDeps` type is shared across all HTTP handlers; wired via a `sharedDeps` object in `account.http.ts` to avoid repetition.

The browser page (`/auth/cli`) reads `familiar_token` from localStorage. If found, it shows the existing token prefix/lastFour and offers "Use this account" or "Create new account". If not found, it offers "Create account and connect". Either path completes the CLI session and the CLI stores the received token.

`familiar login --token fam_...` bypasses the browser entirely and saves the token directly.

The session bridge uses a 10-minute server TTL and a 5-minute CLI poll timeout (150 × 2s).