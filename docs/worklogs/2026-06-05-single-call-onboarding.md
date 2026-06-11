# Single-Call Onboarding

## Summary

Extended `POST /api/v1/accounts` to optionally accept `base_url`, `ai_api_key`, and `tools` in the same request. An AI agent can now create an account, configure its integration, and sync tools in one API call instead of three.

## Motivation

Issue #30. The original onboarding flow required:
1. `POST /api/v1/accounts` → get token
2. `PATCH /api/v1/integration` → set base_url, ai_api_key
3. `POST /api/v1/tools/sync` → sync tools

For AI agents operating autonomously, three sequential API calls with dependent state (the token from step 1 must be used in steps 2 and 3) is too much friction. Agents often fail between steps or get confused about which token to use where.

## Changes

### API

`POST /api/v1/accounts` now accepts an optional body:

```json
{
  "base_url": "https://my-executor.com",
  "ai_api_key": "sk-or-v1-...",
  "tools": [
    {
      "tool_name": "hello.greet",
      "description": "Say hello",
      "input_schema": { "type": "object", "properties": { "name": { "type": "string" } } }
    }
  ]
}
```

Response now includes:
```json
{
  "account": { "id": "...", "created_at": "..." },
  "token": { "value": "fam_...", "prefix": "...", "last_four": "...", "created_at": "..." },
  "integration": { "id": "...", "base_url": "...", "ai_api_key_set": true, "created_at": "..." },
  "tools": { "synced": 1, "status": "ok" }
}
```

All fields remain optional — existing clients sending `{}` continue to work exactly as before.

### SDK

`FamiliarClient.createAccount()` now accepts optional `baseUrl`, `aiApiKey`, and `tools`:

```ts
const result = await FamiliarClient.createAccount({
  baseUrl: "https://my-executor.com",
  tools: [{ toolName: "hello.greet", description: "...", inputSchema: {...} }],
});
```

## Implementation

- `src/app/account/account.http-core.ts` — added `syncProviderTools` to `AccountEndpointDeps`, updated `createHandleCreateAccountEndpoint` to parse optional body fields and chain integration update + tool sync
- `src/app/account/account.http.ts` — wired `syncProviderTools` from `provider.service.ts` into shared deps
- `src/app/account/account.http.test.ts` — updated existing test expectations to include `integration` field, added test for single-call onboarding with all optional fields
- `packages/sdk/src/types.ts` — added `CreateAccountInput` type, extended `CreateAccountResult` with `integration` and optional `tools`
- `packages/sdk/src/index.ts` — updated `FamiliarClient.createAccount()` to accept new input fields and parse new response fields

## Risks

- The response now always includes `integration` even for legacy callers. This is additive and safe.
- `syncProviderTools` is called from the account layer, which creates a cross-module dependency. This is acceptable because `account.service.ts` already imports from `provider.auth-core` and `provider.storage`.
