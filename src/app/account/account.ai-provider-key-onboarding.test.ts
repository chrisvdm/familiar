// worklog: docs/worklogs/2026-04-23-ai-provider-key-onboarding.md
import assert from "node:assert/strict";
import test from "node:test";

import {
  createHandleCurrentIntegrationEndpoint,
} from "./account.http-core.ts";
import {
  createHandleConversationInputEndpoint,
} from "../provider/provider.conversation.endpoint.core.ts";
import {
  jsonError,
  jsonResponse,
  readJson,
  getRequestId,
  getIdempotencyHeader,
  replayIdempotentResponse,
} from "../provider/provider.http.ts";
import {
  buildIdempotencyKey,
  storeIdempotencyReplay,
} from "../provider/provider.idempotency.ts";
import { createTestContext } from "../provider/provider.endpoint.test-helpers.ts";

const VALID_KEY = "sk-or-v1-testkey1234567890";
const VALID_KEY_PREFIX = "sk-or-v1";

const makeIntegration = (overrides: Partial<{
  aiApiKey: string | null;
  baseUrl: string | null;
  toolUrls: Record<string, string>;
}> = {}) => ({
  id: "setup_123",
  accountId: "acct_123",
  name: "Test Integration",
  baseUrl: null,
  aiApiKey: null,
  toolUrls: {},
  createdAt: "2026-03-25T10:00:00.000Z",
  updatedAt: "2026-03-25T10:00:00.000Z",
  ...overrides,
});

const makeAuth = (integration = makeIntegration()) => ({
  account: {
    id: "acct_123",
    defaultSetupId: "setup_123",
    actionCount: 0,
    freeActionsUsed: 0,
    plan: "free",
    createdAt: "2026-03-25T10:00:00.000Z",
  },
  integration,
  token: {
    id: "tok_123",
    prefix: "fam_secr",
    lastFour: "cret",
    createdAt: "2026-03-25T10:00:00.000Z",
    lastUsedAt: null,
  },
});

const sharedDeps = {
  getRequestId,
  readJson,
  jsonResponse,
  jsonError,
  normalizeIntegrationBaseUrl: (u: string) => u.trim().replace(/\/$/, ""),
  createAccountWithInitialToken: async () => { throw new Error("should not create account"); },
  createCliSession: async () => ({ sessionId: "cli_123", expiresAt: "2026-03-25T11:00:00.000Z" }),
  completeCliSession: async () => ({ value: "ok" as const }),
  pollCliSession: async () => ({ state: "pending" as const }),
  getAccountUsage: async () => ({ actionCount: 0, freeActionsUsed: 0, freeActionsRemaining: 10, plan: "free" as const }),
  getIntegrationStatus: async () => ({ toolCount: 0, threadCount: 0 }),
};

const integrationRequest = (method: "GET" | "PATCH", body?: unknown) =>
  new Request("https://example.com/api/v1/integration", {
    method,
    headers: {
      Authorization: "Bearer fam_secret",
      "Content-Type": "application/json",
      "X-Request-Id": "req_test",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

// ─── Behaviour Spec: PATCH with valid key ────────────────────────────────────

test("PATCH /integration stores a valid OpenRouter key and returns masked prefix", async () => {
  let captured: { aiApiKey: string | null } | undefined;

  const endpoint = createHandleCurrentIntegrationEndpoint({
    ...sharedDeps,
    authenticateAccountToken: async () => makeAuth(),
    updateAccountIntegrationBaseUrl: async (input) => {
      captured = { aiApiKey: input.aiApiKey };
      return { ...makeIntegration({ aiApiKey: input.aiApiKey }), baseUrl: input.baseUrl };
    },
  });

  const response = await endpoint({
    request: integrationRequest("PATCH", { ai_api_key: VALID_KEY }),
  });

  assert.equal(response.status, 200);
  assert.equal(captured?.aiApiKey, VALID_KEY);

  const body = await response.json() as { integration: Record<string, unknown> };
  assert.equal(body.integration.ai_api_key_set, true);
  assert.equal(body.integration.ai_api_key_prefix, VALID_KEY_PREFIX);
  assert.ok(!("ai_api_key" in body.integration), "full key must never appear in response");
});

// ─── Behaviour Spec: PATCH with invalid key format ───────────────────────────

test("PATCH /integration rejects a non-OpenRouter key with 400", async () => {
  const endpoint = createHandleCurrentIntegrationEndpoint({
    ...sharedDeps,
    authenticateAccountToken: async () => makeAuth(),
    updateAccountIntegrationBaseUrl: async () => { throw new Error("should not be called"); },
  });

  const response = await endpoint({
    request: integrationRequest("PATCH", { ai_api_key: "sk-ant-notvalid" }),
  });

  assert.equal(response.status, 400);
  const body = await response.json() as { error: { code: string; message: string } };
  assert.equal(body.error.code, "invalid_request");
  assert.match(body.error.message, /sk-or-v1-/);
});

// ─── Behaviour Spec: PATCH with null clears the key ──────────────────────────

test("PATCH /integration clears the key when ai_api_key is null", async () => {
  let captured: { aiApiKey: string | null } | undefined;

  const endpoint = createHandleCurrentIntegrationEndpoint({
    ...sharedDeps,
    authenticateAccountToken: async () => makeAuth(makeIntegration({ aiApiKey: VALID_KEY })),
    updateAccountIntegrationBaseUrl: async (input) => {
      captured = { aiApiKey: input.aiApiKey };
      return { ...makeIntegration({ aiApiKey: input.aiApiKey }), baseUrl: input.baseUrl };
    },
  });

  const response = await endpoint({
    request: integrationRequest("PATCH", { ai_api_key: null }),
  });

  assert.equal(response.status, 200);
  assert.equal(captured?.aiApiKey, null);

  const body = await response.json() as { integration: Record<string, unknown> };
  assert.equal(body.integration.ai_api_key_set, false);
  assert.equal(body.integration.ai_api_key_prefix, null);
});

// ─── Behaviour Spec: PATCH without ai_api_key preserves existing value ────────

test("PATCH /integration preserves existing key when ai_api_key is absent from payload", async () => {
  let captured: { aiApiKey: string | null } | undefined;

  const endpoint = createHandleCurrentIntegrationEndpoint({
    ...sharedDeps,
    authenticateAccountToken: async () => makeAuth(makeIntegration({ aiApiKey: VALID_KEY })),
    updateAccountIntegrationBaseUrl: async (input) => {
      captured = { aiApiKey: input.aiApiKey };
      return { ...makeIntegration({ aiApiKey: input.aiApiKey }), baseUrl: input.baseUrl };
    },
  });

  const response = await endpoint({
    request: integrationRequest("PATCH", { base_url: "https://executor.example" }),
  });

  assert.equal(response.status, 200);
  assert.equal(captured?.aiApiKey, VALID_KEY, "existing key must be preserved when not in payload");
});

// ─── Behaviour Spec: GET returns prefix, never full key ───────────────────────

test("GET /integration returns ai_api_key_set true and prefix when key is set", async () => {
  const endpoint = createHandleCurrentIntegrationEndpoint({
    ...sharedDeps,
    authenticateAccountToken: async () => makeAuth(makeIntegration({ aiApiKey: VALID_KEY })),
    updateAccountIntegrationBaseUrl: async () => { throw new Error("should not be called"); },
  });

  const response = await endpoint({
    request: integrationRequest("GET"),
  });

  assert.equal(response.status, 200);
  const body = await response.json() as { integration: Record<string, unknown> };
  assert.equal(body.integration.ai_api_key_set, true);
  assert.equal(body.integration.ai_api_key_prefix, VALID_KEY_PREFIX);
  assert.ok(!("ai_api_key" in body.integration), "full key must never appear in response");
});

test("GET /integration returns ai_api_key_set false and null prefix when no key is set", async () => {
  const endpoint = createHandleCurrentIntegrationEndpoint({
    ...sharedDeps,
    authenticateAccountToken: async () => makeAuth(makeIntegration({ aiApiKey: null })),
    updateAccountIntegrationBaseUrl: async () => { throw new Error("should not be called"); },
  });

  const response = await endpoint({
    request: integrationRequest("GET"),
  });

  assert.equal(response.status, 200);
  const body = await response.json() as { integration: Record<string, unknown> };
  assert.equal(body.integration.ai_api_key_set, false);
  assert.equal(body.integration.ai_api_key_prefix, null);
});

// ─── Layer 2: aiApiKey is forwarded to handleProviderConversationInput ────────

test("conversation endpoint forwards aiApiKey from auth to handleProviderConversationInput", async () => {
  let capturedConfig: { token: string; baseUrl?: string; aiApiKey?: string } | undefined;

  const endpoint = createHandleConversationInputEndpoint({
    getRequestId,
    getIdempotencyHeader,
    readJson,
    jsonResponse,
    jsonError,
    replayIdempotentResponse,
    authenticateProviderRequest: () => ({
      ok: true as const,
      providerId: "provider_a",
      providerConfig: {
        token: "test-token",
        aiApiKey: VALID_KEY,
      },
    }),
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: () => ({ kind: "miss" as const }),
    storeIdempotencyReplay: ({ context }) => context,
    handleProviderConversationInput: async ({ providerConfig }) => {
      capturedConfig = providerConfig;
      return { state: "completed" };
    },
    incrementAccountActionCount: async () => ({
      actionCount: 1,
      freeActionsUsed: 1,
      freeActionsRemaining: 9,
      plan: "free" as const,
    }),
    isProviderRateLimitError: (error: unknown): error is Error & { retryAfterSeconds: number } => false,
  });

  const response = await endpoint({
    request: new Request("https://example.com/api/v1/input", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
        "X-Request-Id": "req_layer2",
      },
      body: JSON.stringify({
        integration_id: "provider_a",
        user_id: "user_123",
        channel: { type: "web", id: "browser_123" },
        input: { kind: "text", text: "hello" },
      }),
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(capturedConfig?.aiApiKey, VALID_KEY, "aiApiKey must be forwarded from auth to service");
});

// ─── Enforcement: no key → 400 configuration_required ────────────────────────

test("conversation endpoint returns 400 configuration_required when no AI key is set", async () => {
  const endpoint = createHandleConversationInputEndpoint({
    getRequestId,
    getIdempotencyHeader,
    readJson,
    jsonResponse,
    jsonError,
    replayIdempotentResponse,
    authenticateProviderRequest: () => ({
      ok: false as const,
      status: 400,
      error: {
        code: "configuration_required",
        message: "No AI provider key configured. Set one via PATCH /api/v1/integration with your OpenRouter key.",
      },
    }),
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: () => ({ kind: "miss" as const }),
    storeIdempotencyReplay: ({ context }) => context,
    handleProviderConversationInput: async () => { throw new Error("should not be called"); },
    incrementAccountActionCount: async () => ({
      actionCount: 1,
      freeActionsUsed: 1,
      freeActionsRemaining: 9,
      plan: "free" as const,
    }),
    isProviderRateLimitError: (error: unknown): error is Error & { retryAfterSeconds: number } => false,
  });

  const response = await endpoint({
    request: new Request("https://example.com/api/v1/input", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer fam_no_key_token",
        "X-Request-Id": "req_nokey",
      },
      body: JSON.stringify({
        integration_id: "provider_a",
        user_id: "user_123",
        channel: { type: "web", id: "browser_123" },
        input: { kind: "text", text: "hello" },
      }),
    }),
  });

  assert.equal(response.status, 400);
  const body = await response.json() as { error: { code: string; message: string } };
  assert.equal(body.error.code, "configuration_required");
  assert.match(body.error.message, /PATCH \/api\/v1\/integration/);
});

// ─── normalizeAccountRegistryState backfills aiApiKey on legacy records ───────

test("normalizeAccountRegistryState backfills aiApiKey null on integration records that predate the field", async () => {
  const { normalizeAccountRegistryState } = await import("./account-registry-state.ts");

  const normalized = normalizeAccountRegistryState({
    accounts: {},
    integrations: {
      setup_legacy: {
        id: "setup_legacy",
        accountId: "acct_123",
        name: "Legacy Integration",
        baseUrl: null,
        aiApiKey: null,
        toolUrls: {},
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
    tokens: {},
    tokenIndex: {},
  });

  assert.equal(
    normalized.integrations["setup_legacy"]?.aiApiKey,
    null,
    "legacy integration records must get aiApiKey: null on load",
  );
});
