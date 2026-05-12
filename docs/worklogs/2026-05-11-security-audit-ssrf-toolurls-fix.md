# Security Audit: SSRF via per-tool URLs (#32)

## Issue
When syncing tools, `base_url` on individual tools is stored with **zero URL validation**. At execution time the URL is passed directly to `fetch()`.

## Fix Plan
1. Create a shared URL validation function that:
   - Validates protocol is `http:` or `https:`
   - Rejects query strings and hash fragments
   - Rejects private IP ranges (localhost, 10.x, 172.16.x, 192.168.x, 169.254.169.254, 0.0.0.0)
   - Rejects IPv6 loopback and private ranges
2. Apply it to per-tool `base_url` extraction in `syncProviderTools`
3. Apply it to `normalizeIntegrationBaseUrl` as well (covers #33 too)
4. Add tests

## UX / Agent Impact
None — backend hardening. Invalid URLs are rejected at sync time.

## Progress
- [x] Shared validation function (`validateExecutorUrl` in `provider.auth-core.ts`)
- [x] Apply to toolUrls extraction (`syncProviderTools`)
- [x] Apply to normalizeIntegrationBaseUrl (`account.service.ts`)
- [x] Apply to normalizeBaseUrl (`provider.auth-core.ts`)
- [x] Tests (15 new tests covering public URLs, protocols, query/hash, localhost, private IPv4, private IPv6)
- [x] Commit

## Implementation Notes

Created `validateExecutorUrl` in `provider.auth-core.ts` that:
- Validates protocol is `http:` or `https:`
- Rejects query strings and hash fragments
- Rejects private IP ranges via `isPrivateHostname` helper:
  - IPv4: `127.x.x.x`, `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `169.254.x.x`, `0.0.0.0`
  - IPv6: `::1`, `fc00::/7`, `fe80::/10`
  - Hostname: `localhost`

This single function is now used by:
1. `normalizeBaseUrl` (env-config path)
2. `normalizeIntegrationBaseUrl` (account registry path)
3. `syncProviderTools` (per-tool URL extraction)

## GitHub Issue
- #32 (closed by commit)
- #33 also fixed (same commit)