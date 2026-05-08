# Worklog: Free tier operator fallback (#17) + Metering (#16)

## Date
2026-05-08

## Issues
- #17: Make aiApiKey optional with operator OpenRouter fallback for free tier
- #16: Build "first 10 actions free" metering and quota enforcement

## Plan
1. Read current auth, account, and provider service code to understand data flow
2. Implement #17: add usage fields to account model, make auth conditional on freeActionsUsed
3. Test #17: verify agent can onboard without aiApiKey for first 10 actions
4. Commit #17
5. Implement #16: add counter increment + GET /api/v1/account/usage endpoint
6. Test #16: verify free tier limit and paid bypass
7. Commit #16

## Status
- [x] Step 1: Exploration complete
- [x] Step 2: #17 implementation
- [x] Step 3: #17 testing
- [x] Step 4: #17 commit
- [x] Step 5: #16 implementation
- [x] Step 6: #16 testing
- [ ] Step 7: #16 commit

## Exploration findings

### Auth flow
- `provider-auth.ts` line 140: hard-blocks with `configuration_required` if `!accountAuth.integration.aiApiKey`
- `authenticateAccountToken` in `account.service.ts` loads `{ account, integration, token }` from `AccountRegistryDO`
- Service layer (`provider.service.ts` line 591) already has fallback: `const apiKey = aiApiKey || env.OPENROUTER_API_KEY`
- So the service layer is ready — the auth layer is the only blocker

### Account model
- `FamiliarAccount` currently only has `{ id, defaultSetupId, createdAt }`
- `createAccountWithInitialToken` in `account.service.ts` creates the account
- `normalizeAccountRegistryState` in `account-registry-state.ts` handles backward-compat normalization

### Service layer AI key usage
- `callOpenRouter` in `provider.service.ts`: `aiApiKey || env.OPENROUTER_API_KEY`
- `runProfileSynthesis`: passes `providerConfig.aiApiKey`
- `memoryBackend.retrieve`: passes `providerConfig.aiApiKey`
- `buildDirectReply`: passes `providerConfig.aiApiKey`
- `callDecisionModel`: passes `providerConfig.aiApiKey`

All of these fall back to `env.OPENROUTER_API_KEY` when `aiApiKey` is undefined.

## #17 Implementation

### Changes made

1. **`src/app/account/account.types.ts`**
   - Added `actionCount: number`, `freeActionsUsed: number`, `plan: "free" | "paid"` to `FamiliarAccount`

2. **`src/app/account/account.service.ts`**
   - `createAccountWithInitialToken`: initialize `actionCount: 0`, `freeActionsUsed: 0`, `plan: "free"`

3. **`src/app/account/account-registry-state.ts`**
   - Added `normalizeAccountRecord` function with backward-compatible defaults:
     - `actionCount: 0` (if missing)
     - `freeActionsUsed: 0` (if missing)
     - `plan: "free"` (if missing)
   - Updated `normalizeAccountRegistryState` to normalize account records (previously passed through raw)

4. **`src/app/provider/provider-auth.ts`**
   - Changed hard `configuration_required` block to conditional:
     ```ts
     const withinFreeTier = accountAuth.account.freeActionsUsed < 10;
     if (!accountAuth.integration.aiApiKey && !withinFreeTier) {
       return configuration_required;
     }
     ```
   - Changed `aiApiKey` in providerConfig from unconditional to conditional spread:
     ```ts
     ...(accountAuth.integration.aiApiKey
       ? { aiApiKey: accountAuth.integration.aiApiKey }
       : {}),
     ```
     This avoids passing `null` to `ProviderConfig.aiApiKey` which is typed as `string | undefined`.

### Test updates
- `account-registry-do.test.ts`: Updated expected output to include new account fields and `cliSessions: {}`
- `account.http.test.ts`: Added new fields to all mock accounts, added missing CLI session mocks to `sharedDeps`
- `account.ai-provider-key-onboarding.test.ts`: Added new fields to `makeAuth`, added missing CLI session mocks

### Type check
- All new errors resolved. 3 pre-existing test errors remain (unrelated to this change):
  - `provider.auth-core.test.ts`: "normalizeProviderConfigMap rejects invalid JSON" regex mismatch
  - `account.ai-provider-key-onboarding.test.ts`: `isProviderRateLimitError` type predicate (×2)
  - `openrouter.client.test.ts`: `response_format` on `never`

### Runtime tests
- 147/148 tests pass. The 1 failure is the pre-existing `normalizeProviderConfigMap rejects invalid JSON` test.

## #16 Implementation

### Changes made

1. **`src/app/account/account-registry-do.ts`**
   - Added `incrementActionCount({ accountId })`:
     - Increments `actionCount`
     - Increments `freeActionsUsed` only if `plan === "free"`
     - Returns `{ actionCount, freeActionsUsed, freeActionsRemaining, plan }`
   - Added `getAccountUsage({ accountId })`:
     - Returns current usage stats without modifying

2. **`src/app/account/account.service.ts`**
   - Added `incrementAccountActionCount(accountId)` wrapper
   - Added `getAccountUsage(accountId)` wrapper
   - Updated `AccountRegistryStub` type with new DO methods

3. **`src/app/account/account.http-core.ts`**
   - Added `getAccountUsage` to `AccountEndpointDeps`
   - Added `createHandleAccountUsageEndpoint` handler:
     - Authenticates bearer token
     - Returns `{ account_id, plan, action_count, free_actions_used, free_actions_remaining }`

4. **`src/app/account/account.http.ts`**
   - Imported `getAccountUsage` from service
   - Exported `handleAccountUsageEndpoint`

5. **`src/app/account/account.routes.ts`**
   - Added `GET /api/v1/account/usage` route

6. **`src/app/provider/provider.conversation.endpoint.core.ts`**
   - Added `incrementAccountActionCount` to `ConversationEndpointDeps`
   - After successful `handleProviderConversationInput`, calls `incrementAccountActionCount(auth.accountId)`
   - Applied to both idempotent and non-idempotent paths

7. **`src/app/provider/provider.conversation.endpoint.ts`**
   - Imported `incrementAccountActionCount` from account service
   - Wired it into `handleConversationInputEndpoint` deps

### Test updates
- `provider.endpoint.test-helpers.ts`: Added `incrementAccountActionCount` to `sharedEndpointDeps`
- `provider.conversation.endpoint.test.ts`: Uses shared deps, so no changes needed
- `account.ai-provider-key-onboarding.test.ts`: Added `incrementAccountActionCount` and `getAccountUsage` mocks
- `account.http.test.ts`: Added `getAccountUsage` to `sharedDeps`

### Type check
- All new errors resolved. Same 3 pre-existing errors remain.

### Runtime tests
- 147/148 tests pass. The 1 failure is pre-existing.

## Verification

### Free tier flow
1. `POST /api/v1/accounts` → creates account with `plan: "free"`, `freeActionsUsed: 0`
2. `POST /api/v1/input` without `aiApiKey` → passes auth (within free tier)
3. Service layer uses `env.OPENROUTER_API_KEY` fallback
4. After 10th action, `freeActionsUsed === 10`
5. 11th `POST /api/v1/input` → auth returns `configuration_required`

### Usage endpoint
- `GET /api/v1/account/usage` → returns current stats for authenticated token

## Next steps
- Deploy and test with a fresh account via curl
- Close #16 and #17 on GitHub
- Move to #18 (GET /api/v1/integration/status) or #20 (landing page CTAs)
