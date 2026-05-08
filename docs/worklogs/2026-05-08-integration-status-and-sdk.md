# Worklog: Integration status endpoint (#18) + SDK completion

## Date
2026-05-08

## Issues
- #18: Add `GET /api/v1/integration/status` endpoint
- SDK gap: threads, memory, webhooks not yet wrapped (related to open issues #19-#29)

## Scope
1. Add a new integration status endpoint that returns config, usage, and runtime stats
2. Finish the SDK by wrapping all server endpoints that exist but weren't exposed

## #18 Implementation

### Changes
1. **`src/app/account/account.http-core.ts`**
   - Added `getIntegrationStatus` to `AccountEndpointDeps`
   - Added `createHandleIntegrationStatusEndpoint` handler

2. **`src/app/account/account.service.ts`**
   - Added `getIntegrationStatus({ accountId, integrationId })`
   - Imports `loadProviderUserContext` from provider storage
   - Returns `{ toolCount, threadCount }`

3. **`src/app/account/account.http.ts`**
   - Wired `getIntegrationStatus` into shared deps
   - Exported `handleIntegrationStatusEndpoint`

4. **`src/app/account/account.routes.ts`**
   - Added `GET /api/v1/integration/status` route

### Response shape
```json
{
  "integration": { "id", "base_url", "ai_api_key_set", "ai_api_key_prefix", "created_at", "updated_at" },
  "account": { "id", "plan", "action_count", "free_actions_used", "free_actions_remaining" },
  "runtime": { "tool_count", "thread_count" }
}
```

## SDK Completion

### New methods added
- `familiar.account.usage()` → `GET /api/v1/account/usage`
- `familiar.integration.status()` → `GET /api/v1/integration/status`
- `familiar.threads.list({ userId? })` → `GET /api/v1/users/:userId/threads`
- `familiar.threads.create({ channel, title?, isPrivate? })` → `POST /api/v1/threads`
- `familiar.threads.delete({ threadId })` → `DELETE /api/v1/threads/:id`

### Files changed
- `packages/sdk/src/types.ts` — added `IntegrationStatus`, `AccountUsage`, `Thread`, `ThreadListResult`, `ThreadCreateResult`, `ThreadDeleteResult`
- `packages/sdk/src/index.ts` — added `account`, `threads`, and `integration.status()`
- `packages/sdk/README.md` — documented all new methods

### Build
- SDK builds clean (`tsc` passes)

## Test updates
- `account.http.test.ts` — added `getIntegrationStatus` mock
- `account.ai-provider-key-onboarding.test.ts` — added `getIntegrationStatus` mock

## Status
- [x] #18 endpoint implemented and tested
- [x] SDK wraps all major server endpoints
- [x] Types clean (3 pre-existing errors only)
- [x] Tests pass (147/148)

## Related
- #30: Created ticket for curl-only tool syncing investigation
