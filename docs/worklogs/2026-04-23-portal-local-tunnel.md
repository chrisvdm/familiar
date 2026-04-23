# Portal: Local Tunnel Manager
<!-- gh issue #12 -->

## Context

Developers building local executors against the hosted familiar API face a manual setup loop:

1. Start their executor locally
2. Run `npx wrangler tunnel --url http://localhost:PORT` to get a public URL
3. Copy the generated `trycloudflare.com` URL
4. `PATCH /api/v1/integration` to register it
5. Repeat from step 2 every time the tunnel restarts, because the URL changes

This is friction that familiar can eliminate. The idea is a `portal` command — either part of the familiar CLI or a small standalone package — that owns the tunnel lifecycle and keeps the integration URL in sync automatically.

## Ideation

We explored the design space across three axes:

**Standalone vs. CLI command**
Standalone (`@familiar/portal`) has appeal as an independent artefact, but the familiar CLI already holds the stored token and the account context. Duplicating that in a separate package adds maintenance surface. DX wins over clout — we stay in the CLI.

**Tunnel backend**
We want to stay in the Cloudflare ecosystem. `wrangler tunnel` is already in the developer's environment and needs no auth or named-tunnel setup. The ephemeral URL changing on restart is fine because portal owns re-registration. Named tunnels (stable URL) are a possible future upgrade but not needed at MVP.

**Process model: foreground companion vs. child-process wrapper**
One command that also spawns the executor (`familiar portal -- npm run dev`) is the most seamless DX, but it feels presumptuous — it makes assumptions about how the developer runs their server, handles their logs, and restarts their process. Better to let the developer own their executor process and run `familiar portal` alongside it in a second terminal. If traction grows and developers want the one-command form, they can wire it themselves. We can document the pattern without mandating it.

**Settled design:**
- `familiar portal --port <PORT>` as a new command in the existing familiar CLI
- Uses `wrangler tunnel` under the hood
- Starts in the foreground, captures the generated URL, calls `PATCH /api/v1/integration`
- Watches the tunnel process; on restart, re-registers the new URL
- On `Ctrl-C`, optionally clears `base_url` from the integration

## RFC

### 2000ft View

`familiar portal --port <PORT>` is a new CLI command that manages the full local tunnel lifecycle for a developer. It starts a `cloudflared` quick tunnel pointed at the given port, parses the generated URL from the process output, registers it with the familiar API via `PATCH /api/v1/integration`, and watches the tunnel process. If the tunnel dies it restarts and re-registers the new URL. On exit it clears `base_url` from the integration so familiar doesn't keep calling a dead URL.

The developer runs their executor in one terminal and `familiar portal` in another. No manual URL copying, no re-registration on restart.

### Behaviour Spec

**GIVEN** `cloudflared` is not installed  
**WHEN** `familiar portal --port 8787` is run  
**THEN** prints a clear install message and exits 1

**GIVEN** no stored token and no `--token` flag  
**WHEN** `familiar portal --port 8787` is run  
**THEN** prints a helpful error and exits 1

**GIVEN** a valid stored token and `cloudflared` installed  
**WHEN** `familiar portal --port 8787` is run  
**THEN** starts the tunnel, parses the `trycloudflare.com` URL, calls `PATCH /api/v1/integration { base_url }`, prints "Ready."

**GIVEN** portal is running and the tunnel process dies  
**WHEN** the process exits with a non-zero code  
**THEN** portal restarts it, re-registers the new URL

**GIVEN** portal is running  
**WHEN** `Ctrl-C` is pressed  
**THEN** kills the tunnel, calls `PATCH /api/v1/integration { base_url: null }`, exits cleanly

### Implementation Breakdown

- `[MODIFY]` `familiar.mjs` — add `patchJson` helper, `--port` arg parsing, `portal` command, help text entry
- `[MODIFY]` `src/app/docs-content/quickstart.md` — fix wrong `npx wrangler tunnel` command, reference `familiar portal` as the recommended path
- `[MODIFY]` `docs/worklogs/2026-04-23-portal-local-tunnel.md` — record findings and close

### Invariants

- Full key is never logged
- `base_url` is cleared on clean exit (best-effort, not fatal if it fails)
- Tunnel restart loop backs off 2s between attempts

## Investigation

**Tunnel backend: `cloudflared`, not `wrangler tunnel`**

`wrangler tunnel` does not exist in wrangler 4.x. The correct tool is `cloudflared` (the standalone Cloudflare tunnel daemon). `cloudflared` is already installed on the dev machine at `/opt/homebrew/bin/cloudflared`.

Our own quickstart doc (`src/app/docs-content/quickstart.md`) referenced `npx wrangler tunnel` — that command is wrong and needs fixing.

**URL parsing**

The tunnel URL appears on stderr in this format:
```
2026-04-23T13:07:35Z INF |  https://improve-daily-jeans-survive.trycloudflare.com  ...
```
Regex `/https:\/\/[a-z0-9-]+\.trycloudflare\.com/` against each stderr line will capture it reliably.

**CLI gaps**

`familiar.mjs` has `postJson` and `getJson` helpers but no `patchJson`. We need to add one. `resolveToken()` already handles reading the stored token from `~/.codex/familiar/config.json` — portal can reuse it directly.

**`cloudflared` as a prerequisite**

Portal should check for `cloudflared` at startup and print a clear install message if it is missing (`brew install cloudflared` / `winget install Cloudflare.cloudflared`).

## Implementation

Added `familiar portal --port <PORT>` to `src/cli/familiar.mjs`:

- `patchJson` helper added (mirrors existing `postJson`/`getJson` pattern)
- `--port` added to `parseArgs`
- `runPortal` function: checks for `cloudflared`, spawns tunnel, parses URL from stdout/stderr via regex, calls `PATCH /api/v1/integration`, restarts tunnel on unexpected exit, clears `base_url` on `Ctrl-C`
- Help text and usage updated

Fixed `src/app/docs-content/quickstart.md`:
- Replaced wrong `npx wrangler tunnel` command (doesn't exist in wrangler 4.x) with `familiar portal` as the recommended path and `cloudflared tunnel` as the manual fallback
- No other docs files had the wrong command

## Closed

All tasks complete. Issue #12 to be closed.
