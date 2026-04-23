# AI Provider Key Onboarding
<!-- gh issue #10 -->

## Context

familiar is a hosted service on Cloudflare. Every call to `POST /api/v1/input` triggers one or more OpenRouter model calls (routing, extraction, answer). Those calls are authenticated with `OPENROUTER_API_KEY` — currently a single wrangler secret owned by Chris.

This means every account that creates an integration and sends a message burns the owner's OpenRouter credits. There is no per-account key, and no documentation telling developers they need to supply one.

Before external launch, each integration must provide its own AI provider key. The hosted service should use that key for all model calls on behalf of that integration. The global `OPENROUTER_API_KEY` wrangler secret should serve only as a fallback for local development and internal tooling.

## Investigation

### Current key flow

Model calls happen in two places:

- `provider.service.ts` → `callOpenRouter` — used for routing (decision model) and answer generation
- `chat.memory.ts` → `callOpenRouter` — used for memory extraction and selection

Both read `env.OPENROUTER_API_KEY` directly. Neither has per-integration key support.

### Integration record today

`FamiliarIntegrationConfig` in `account.types.ts`:

```typescript
{
  id: string;
  accountId: string;
  baseUrl: string | null;   // executor URL — already settable via PATCH /api/v1/integration
  createdAt: string;
  updatedAt: string;
}
```

`baseUrl` is the only configurable field. The pattern for adding `aiApiKey` is identical to how `baseUrl` was added.

### Auth flow at call time

`provider-auth.ts` resolves the integration record and puts it in `providerConfig`:

```typescript
return {
  ok: true,
  providerId: resolvedProviderId,
  providerConfig: {
    token,
    ...(accountAuth.integration.baseUrl ? { baseUrl: accountAuth.integration.baseUrl } : {}),
  },
  accountId: accountAuth.account.id,
};
```

`providerConfig` is then threaded through to `handleProviderConversationInput` and available throughout the service. Adding `aiApiKey` here makes it available everywhere a model call is made.

### `ProviderConfig` type today

```typescript
type ProviderConfig = {
  token: string;
  baseUrl?: string;
}
```

### `PATCH /api/v1/integration` today

`account.http-core.ts` already handles `{ base_url }` on a PATCH. The same handler can accept `{ ai_api_key }` with identical normalisation logic.

### Quickstart and CLI gaps

- `provider-quickstart.md` has no mention of an AI provider key
- `familiar init` creates an account and prints the token, but gives no next-step guidance about setting a key
- `current-mvp-spec.md` does not list an AI key endpoint or onboarding step

### Key format note

The current system is OpenRouter-only. OpenRouter keys start `sk-or-v1-`. We store the key as-is and pass it as `Authorization: Bearer <key>`. No provider abstraction is needed yet — the field is `ai_api_key` and the runtime passes it to OpenRouter. Supporting direct Anthropic/OpenAI/Kimi APIs is a later concern.

## Findings

1. `FamiliarIntegrationConfig` needs an `aiApiKey: string | null` field.
2. `updateIntegration` in the DO needs to accept and persist it.
3. `provider-auth.ts` needs to pass it through `providerConfig`.
4. `ProviderConfig` type needs `aiApiKey?: string`.
5. `callOpenRouter` in both `provider.service.ts` and `chat.memory.ts` needs to prefer `providerConfig.aiApiKey` over `env.OPENROUTER_API_KEY`.
6. `PATCH /api/v1/integration` needs to accept `{ ai_api_key }` in the request body.
7. `GET /api/v1/integration` should return whether a key is set, but not the key value itself (masked or boolean).
8. `provider-quickstart.md` needs a step for setting the key.
9. `familiar init` output should tell users their next step is to set their AI key.
10. `.dev.vars` needs the real key replaced with the placeholder. `.dev.vars.example` is already correct.

## RFC

### 2000ft View

familiar is a hosted service where every conversation turn makes one or more OpenRouter model calls. Currently all those calls use a single shared API key owned by the operator. This is not viable for external launch — every developer who creates an account would silently consume the operator's credits.

The fix is straightforward: each integration stores its own AI provider key. When familiar makes a model call, it uses the integration's key if one is set, and falls back to the global environment key only when it is not (which covers local development and the operator's own tooling).

The integration record already has a `baseUrl` field set via `PATCH /api/v1/integration`. We follow the exact same pattern to add `ai_api_key`. Validation happens on write: we reject any key that does not start with a known provider prefix. For now the only accepted prefix is `sk-or-v1-` since the runtime only calls OpenRouter. The stored key is never returned on read — instead, `GET /api/v1/integration` returns `ai_api_key_prefix` (first 8 characters), which is enough to confirm a key is set and identify which provider it belongs to. This also lays the groundwork for automatic provider detection when direct Anthropic/OpenAI/Kimi support is added later.

The onboarding story gains one clear step: after `familiar init`, the developer runs one `curl` (or CLI command) to set their key. The quickstart is updated to show this, and `familiar init` output is updated to tell the user what to do next.

### Database Changes

`FamiliarIntegrationConfig` (stored in `AccountRegistryDurableObject`):

| Field | Type | Change |
|---|---|---|
| `aiApiKey` | `string \| null` | Added — stores the raw key, never returned on read |

No new tables or indexes. The Durable Object storage schema is additive — existing records without the field normalise to `null`.

### Behavior Spec

**GIVEN** a developer has created an account and has a token  
**WHEN** they call `PATCH /api/v1/integration` with a valid `ai_api_key`  
**THEN** the key is stored, and `GET /api/v1/integration` returns `ai_api_key_prefix: "sk-or-v1"` and `ai_api_key_set: true`

**GIVEN** a valid key is stored for the integration  
**WHEN** `POST /api/v1/input` is called  
**THEN** all OpenRouter calls for that turn use the integration's key, not the global env key

**GIVEN** no key is stored for the integration  
**WHEN** `POST /api/v1/input` is called  
**THEN** all OpenRouter calls fall back to `env.OPENROUTER_API_KEY`

**GIVEN** a developer submits a key that does not start with `sk-or-v1-`  
**WHEN** they call `PATCH /api/v1/integration`  
**THEN** familiar returns 400 `invalid_request` with message `"Unrecognised API key format. Expected an OpenRouter key starting with sk-or-v1-."`

**GIVEN** a developer calls `GET /api/v1/integration`  
**THEN** the response includes `ai_api_key_prefix` (first 8 chars if set, `null` if not) and `ai_api_key_set: boolean` — the full key is never returned

### API Reference

#### `PATCH /api/v1/integration`

Existing endpoint — extended to accept `ai_api_key`.

Request:
```json
{
  "base_url": "https://my-executor.example.com",
  "ai_api_key": "sk-or-v1-..."
}
```

Both fields remain optional and independent. Either can be set or cleared in one call.

To clear the key:
```json
{ "ai_api_key": null }
```

#### `GET /api/v1/integration`

Extended response:
```json
{
  "integration": {
    "id": "setup_...",
    "base_url": "https://my-executor.example.com",
    "ai_api_key_set": true,
    "ai_api_key_prefix": "sk-or-v1",
    "created_at": "...",
    "updated_at": "..."
  }
}
```

### Implementation Breakdown

**`src/app/account/account.types.ts`** `[MODIFY]`
- Add `aiApiKey: string | null` to `FamiliarIntegrationConfig`

**`src/app/account/account-registry-state.ts`** `[MODIFY]`
- Normalise `aiApiKey` to `null` on existing records that lack the field

**`src/app/account/account-registry-do.ts`** `[MODIFY]`
- Add `aiApiKey: string | null` to `updateIntegration` input
- Persist it on the integration record

**`src/app/account/account.service.ts`** `[MODIFY]`
- Add `aiApiKey` to `updateAccountIntegrationBaseUrl` (or rename to `updateAccountIntegration`)

**`src/app/account/account.http-core.ts`** `[MODIFY]`
- Accept `ai_api_key` in the PATCH body
- Validate prefix: reject anything not starting with `sk-or-v1-` (unless null)
- Extract and return `ai_api_key_prefix` (first 8 chars) and `ai_api_key_set` on GET — never return the full key

**`src/app/provider/provider.types.ts`** `[MODIFY]`
- Add `aiApiKey?: string` to `ProviderConfig`

**`src/app/provider/provider-auth.ts`** `[MODIFY]`
- Pass `integration.aiApiKey` through `providerConfig` when present

**`src/app/provider/provider.service.ts`** `[MODIFY]`
- `callOpenRouter`: accept optional `aiApiKey` param; prefer it over `env.OPENROUTER_API_KEY`
- Thread `providerConfig.aiApiKey` through to all `callOpenRouter` call sites

**`src/app/chat/chat.memory.ts`** `[MODIFY]`
- `callOpenRouter`: same pattern — accept and prefer per-integration key

**`src/app/provider/provider.conversation.endpoint.core.ts`** `[MODIFY]`
- Thread `providerConfig.aiApiKey` through to `handleProviderConversationInput`

**`src/cli/familiar.mjs`** `[MODIFY]`
- After printing the token in `init`, print a next-step message directing the user to set their AI key

**`docs/blueprints/provider-quickstart.md`** `[MODIFY]`
- Add Step 1.5: set the AI provider key via `PATCH /api/v1/integration`

**`.dev.vars`** `[MODIFY]`
- Replace real key with `your_openrouter_key` placeholder

### Directory & File Structure

```
src/app/account/
  account.types.ts              ← add aiApiKey to FamiliarIntegrationConfig
  account-registry-state.ts     ← normalise aiApiKey on load
  account-registry-do.ts        ← persist aiApiKey in updateIntegration
  account.service.ts            ← pass aiApiKey through update call
  account.http-core.ts          ← validate + expose on PATCH/GET

src/app/provider/
  provider.types.ts             ← add aiApiKey to ProviderConfig
  provider-auth.ts              ← thread aiApiKey into providerConfig
  provider.service.ts           ← prefer per-integration key in callOpenRouter
  provider.conversation.endpoint.core.ts ← thread aiApiKey to service

src/app/chat/
  chat.memory.ts                ← prefer per-integration key in callOpenRouter

src/cli/
  familiar.mjs                  ← next-step message after init

docs/blueprints/
  provider-quickstart.md        ← add key setup step

.dev.vars                       ← replace real key with placeholder
```

### Types & Data Structures

```typescript
// account.types.ts
type FamiliarIntegrationConfig = {
  id: string;
  accountId: string;
  baseUrl: string | null;
  aiApiKey: string | null;      // added
  createdAt: string;
  updatedAt: string;
};

// provider.types.ts
type ProviderConfig = {
  token: string;
  baseUrl?: string;
  aiApiKey?: string;            // added
};
```

### Invariants & Constraints

- The full `ai_api_key` value is never returned by any API endpoint.
- Only keys starting with `sk-or-v1-` are accepted. All others return 400.
- Null is a valid value — it clears a previously set key.
- If no per-integration key is set, `env.OPENROUTER_API_KEY` is used as fallback. If that is also absent, the model call throws with a clear error.
- The prefix check is the only validation. We do not make a test call to OpenRouter to verify the key is valid — that would add latency and cost.

### System Flow (Snapshot Diff)

**Before:**
```
POST /api/v1/input
  → authenticate token
  → callOpenRouter(env.OPENROUTER_API_KEY)   ← always uses operator key
```

**After:**
```
POST /api/v1/input
  → authenticate token → resolve providerConfig (includes aiApiKey if set)
  → callOpenRouter(providerConfig.aiApiKey ?? env.OPENROUTER_API_KEY)
```

### Suggested Verification

```bash
BASE=http://localhost:5173
TOKEN=<your token>

# 1. Set a valid key
curl -s -X PATCH $BASE/api/v1/integration \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ai_api_key": "sk-or-v1-yourkeyhere"}' | jq .
# Expected: ai_api_key_set: true, ai_api_key_prefix: "sk-or-v1"

# 2. Confirm GET shows prefix but not full key
curl -s $BASE/api/v1/integration \
  -H "Authorization: Bearer $TOKEN" | jq .

# 3. Send a message — should use integration key, not env key
curl -s -X POST $BASE/api/v1/input \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input": {"kind": "text", "text": "hello"}, "channel": {"type": "web", "id": "key-test"}}' | jq .

# 4. Try an invalid key format
curl -s -X PATCH $BASE/api/v1/integration \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ai_api_key": "sk-ant-notvalid"}' | jq .
# Expected: 400 invalid_request

# 5. Clear the key — falls back to env key
curl -s -X PATCH $BASE/api/v1/integration \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ai_api_key": null}' | jq .
```

### Tasks

- [x] Add `aiApiKey` to `FamiliarIntegrationConfig` type
- [x] Normalise `aiApiKey` in `account-registry-state.ts`
- [x] Persist `aiApiKey` in `updateIntegration` DO method
- [x] Thread `aiApiKey` through `account.service.ts`
- [x] Validate prefix and expose on PATCH/GET in `account.http-core.ts`
- [x] Add `aiApiKey` to `ProviderConfig` type
- [x] Thread `aiApiKey` through `provider-auth.ts`
- [x] Prefer per-integration key in `provider.service.ts` `callOpenRouter`
- [x] Prefer per-integration key in `chat.memory.ts` `callOpenRouter`
- [x] Thread `aiApiKey` through conversation endpoint core
- [x] Update `familiar init` output with next-step message
- [x] Update `provider-quickstart.md` with key setup step
- [x] Replace real key in `.dev.vars`

## Implemented AI provider key RFC

We worked through the full call chain from storage to model calls. Key implementation notes:

- `account-registry-state.ts` now runs a `normalizeIntegrationRecord` helper to backfill `aiApiKey: null` on any existing DO records that predate this field.
- The PATCH handler distinguishes three states for `ai_api_key` in the request body: absent (preserve current value), `null` (clear), string (set after prefix validation).
- `callOpenRouter` in both `provider.service.ts` and `chat.memory.ts` now uses `aiApiKey || env.OPENROUTER_API_KEY` — the per-integration key takes precedence, falling back to the global env key.
- `MemoryRetrieveParams` and `MemoryStoreParams` gained `aiApiKey?: string` so the `MemoryBackend` interface carries the key through to the memory pipeline without coupling the backend interface to `ProviderConfig`.
- `synthesizeUserProfile`, `refreshMemories`, and `buildMemoryContext` in `chat.memory.ts` all accept and pass through `aiApiKey`.
- `decideConversationAction`, `updatePendingToolArguments`, `buildDirectReply`, `callDecisionModel`, and `runProfileSynthesis` in `provider.service.ts` all accept and pass through `aiApiKey`.
- `.dev.vars` real key replaced with placeholder. Developers must set their own key via `PATCH /api/v1/integration` before making model calls.

## Wrote worklog tests

Created `src/app/account/account.ai-provider-key-onboarding.test.ts` covering the full Behaviour Spec:

| Test | Layer | Result |
|---|---|---|
| PATCH stores valid key, returns masked prefix | HTTP | ✅ |
| PATCH rejects non-OpenRouter key with 400 | HTTP | ✅ |
| PATCH with null clears key | HTTP | ✅ |
| PATCH without ai_api_key preserves existing value | HTTP | ✅ |
| GET returns prefix + set flag when key is set | HTTP | ✅ |
| GET returns false + null prefix when no key | HTTP | ✅ |
| Conversation endpoint forwards aiApiKey to service | Provider threading | ✅ |
| normalizeAccountRegistryState backfills aiApiKey null on legacy records | Storage | ✅ |

One pre-existing failure in `provider.auth-core.test.ts` (test 41 — `normalizeProviderConfigMap rejects invalid JSON`) was present before this worklog and is unrelated to this feature. Suite: 141 pass, 1 pre-existing fail.

## Hardened key requirement

After review, we tightened the account-auth path to treat a missing `aiApiKey` as a hard failure rather than falling back to the global operator key. This prevents accidental billing exposure when operators host accounts for third parties. The change lands in `provider-auth.ts`: if `accountAuth.integration.aiApiKey` is falsy, the auth path now returns `{ ok: false, status: 400, code: "configuration_required" }` instead of constructing a `providerConfig` without a key. Static config providers registered via `TEXTY_EXECUTOR_CONFIG` are unaffected — they bypass the account auth path entirely.

## Updated external documentation

Scanned `docs/blueprints/` for docs that describe onboarding without mentioning the key requirement. Found gaps in three files. Updated:

- `current-mvp-spec.md` — added endpoint 3 (`PATCH /api/v1/integration` for key setup) and `configuration_required` to the Error Model section, renumbered subsequent endpoints
- `provider-api-spec.md` — added `configuration_required` to Error Codes with a note pointing callers to the fix
- `ai-integration-direction.md` — inserted step 4 (set AI provider key) into the happy path list, renumbered subsequent steps

## Closed worklog

All 13 RFC tasks complete. Tests passing. Docs updated. Issue #10 closed with actual results.
