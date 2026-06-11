import assert from "node:assert/strict";
import test from "node:test";

import {
  createHandleCreateAccountEndpoint,
  createHandleCurrentIntegrationEndpoint,
  createHandleGetAccountEndpoint,
} from "./account.http-core.ts";
import {
  jsonError,
  jsonResponse,
  readJson,
  getRequestId,
} from "../provider/provider.http.ts";

const sharedDeps = {
  getRequestId,
  readJson,
  jsonResponse,
  jsonError,
  normalizeIntegrationBaseUrl: (baseUrl: string) => baseUrl.trim().replace(/\/$/, ""),
  updateAccountIntegrationBaseUrl: async () => ({
    id: "setup_123",
    baseUrl: "https://executor.example",
    aiApiKey: null,
    transport: "webhook" as const,
    createdAt: "2026-03-25T10:00:00.000Z",
    updatedAt: "2026-03-25T10:05:00.000Z",
  }),
  createBrowserLoginSession: async () => ({ code: "browser_abc123", expiresAt: "2026-03-25T11:00:00.000Z" }),
  getAccountUsage: async () => ({ actionCount: 0, freeActionsRemaining: 5 }),
  getIntegrationStatus: async () => ({ toolCount: 0, threadCount: 0 }),
  checkRateLimitByIp: async () => ({ allowed: true }),
  syncProviderTools: async () => ({
    integration_id: "setup_123",
    user_id: "default",
    synced_tools: 0,
    status: "ok",
  }),
};

test("create account endpoint returns account and first token", async () => {
  const endpoint = createHandleCreateAccountEndpoint({
    ...sharedDeps,
    authenticateAccountToken: async () => null,
    createAccountWithInitialToken: async () => ({
      account: {
        id: "acct_123",
        defaultSetupId: "setup_123",
        // Billing removed for open-source
        createdAt: "2026-03-25T10:00:00.000Z",
      },
      integration: {
        id: "setup_123",
        baseUrl: null,
        aiApiKey: null,
        transport: "webhook" as const,
        createdAt: "2026-03-25T10:00:00.000Z",
        updatedAt: "2026-03-25T10:00:00.000Z",
      },
      token: {
        value: "fam_secret",
        prefix: "fam_secr",
        lastFour: "cret",
        createdAt: "2026-03-25T10:00:00.000Z",
      },
    }),
  });

  const response = await endpoint({
    request: new Request("https://example.com/api/v1/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "req_123",
      },
      body: JSON.stringify({
      }),
    }),
  });

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    account: {
      id: "acct_123",
      created_at: "2026-03-25T10:00:00.000Z",
    },
    token: {
      value: "fam_secret",
      prefix: "fam_secr",
      last_four: "cret",
      created_at: "2026-03-25T10:00:00.000Z",
    },
    integration: {
      id: "setup_123",
      base_url: null,
      ai_api_key_set: false,
      created_at: "2026-03-25T10:00:00.000Z",
    },
    request_id: "req_123",
  });
});

test("create account endpoint accepts base_url, ai_api_key, and tools for single-call onboarding", async () => {
  let capturedSyncInput: unknown;

  const endpoint = createHandleCreateAccountEndpoint({
    ...sharedDeps,
    authenticateAccountToken: async () => null,
    createAccountWithInitialToken: async () => ({
      account: {
        id: "acct_456",
        defaultSetupId: "setup_456",
        createdAt: "2026-03-25T10:00:00.000Z",
      },
      integration: {
        id: "setup_456",
        baseUrl: null,
        aiApiKey: null,
        transport: "webhook" as const,
        createdAt: "2026-03-25T10:00:00.000Z",
        updatedAt: "2026-03-25T10:00:00.000Z",
      },
      token: {
        value: "fam_secret2",
        prefix: "fam_sec2",
        lastFour: "ret2",
        createdAt: "2026-03-25T10:00:00.000Z",
      },
    }),
    normalizeIntegrationBaseUrl: (url: string) => url.trim().replace(/\/$/, ""),
    updateAccountIntegrationBaseUrl: async (input) => ({
      id: "setup_456",
      baseUrl: input.baseUrl,
      aiApiKey: input.aiApiKey,
      transport: input.transport ?? "webhook",
      createdAt: "2026-03-25T10:00:00.000Z",
      updatedAt: "2026-03-25T10:05:00.000Z",
    }),
    syncProviderTools: async (input) => {
      capturedSyncInput = input;
      return {
        integration_id: input.integration_id,
        user_id: input.user_id,
        synced_tools: input.tools.length,
        status: "ok",
      };
    },
  });

  const response = await endpoint({
    request: new Request("https://example.com/api/v1/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "req_456",
      },
      body: JSON.stringify({
        base_url: "https://my-executor.com/",
        ai_api_key: "sk-or-v1-test",
        tools: [
          {
            tool_name: "hello.greet",
            description: "Say hello",
            input_schema: { type: "object", properties: { name: { type: "string" } } },
          },
        ],
      }),
    }),
  });

  assert.equal(response.status, 201);
  const body = (await response.json()) as {
    account: { id: string };
    token: { value: string };
    integration: { base_url: string; ai_api_key_set: boolean };
    tools: { synced: number; status: string };
  };
  assert.equal(body.account.id, "acct_456");
  assert.equal(body.token.value, "fam_secret2");
  assert.equal(body.integration.base_url, "https://my-executor.com");
  assert.equal(body.integration.ai_api_key_set, true);
  assert.equal(body.tools.synced, 1);
  assert.equal(body.tools.status, "ok");
  assert.equal((capturedSyncInput as { integration_id: string }).integration_id, "setup_456");
  assert.equal((capturedSyncInput as { user_id: string }).user_id, "default");
});

test("get account endpoint resolves account from bearer token", async () => {
  const endpoint = createHandleGetAccountEndpoint({
    ...sharedDeps,
    createAccountWithInitialToken: async () => {
      throw new Error("should not create account");
    },
    authenticateAccountToken: async () => ({
      account: {
        id: "acct_123",
        defaultSetupId: "setup_123",
        // Billing removed for open-source
        createdAt: "2026-03-25T10:00:00.000Z",
      },
      integration: {
        id: "setup_123",
        baseUrl: "https://executor.example",
        aiApiKey: null,
        transport: "webhook" as const,
        createdAt: "2026-03-25T10:00:00.000Z",
        updatedAt: "2026-03-25T10:05:00.000Z",
      },
      token: {
        id: "tok_123",
        prefix: "fam_secr",
        lastFour: "cret",
        createdAt: "2026-03-25T10:00:00.000Z",
        lastUsedAt: "2026-03-25T10:01:00.000Z",
      },
    }),
  });

  const response = await endpoint({
    request: new Request("https://example.com/api/v1/account", {
      method: "GET",
      headers: {
        Authorization: "Bearer fam_secret",
        "X-Request-Id": "req_456",
      },
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    account: {
      id: "acct_123",
      created_at: "2026-03-25T10:00:00.000Z",
    },
    setup: {
      id: "setup_123",
      base_url: "https://executor.example",
    },
    token: {
      id: "tok_123",
      prefix: "fam_secr",
      last_four: "cret",
      created_at: "2026-03-25T10:00:00.000Z",
      last_used_at: "2026-03-25T10:01:00.000Z",
    },
    request_id: "req_456",
  });
});

test("current integration endpoint returns stored executor base url", async () => {
  const endpoint = createHandleCurrentIntegrationEndpoint({
    ...sharedDeps,
    createAccountWithInitialToken: async () => {
      throw new Error("should not create account");
    },
    authenticateAccountToken: async () => ({
      account: {
        id: "acct_123",
        defaultSetupId: "setup_123",
        // Billing removed for open-source
        createdAt: "2026-03-25T10:00:00.000Z",
      },
      integration: {
        id: "setup_123",
        baseUrl: "https://executor.example",
        aiApiKey: null,
        transport: "webhook" as const,
        createdAt: "2026-03-25T10:00:00.000Z",
        updatedAt: "2026-03-25T10:05:00.000Z",
      },
      token: {
        id: "tok_123",
        prefix: "fam_secr",
        lastFour: "cret",
        createdAt: "2026-03-25T10:00:00.000Z",
        lastUsedAt: "2026-03-25T10:01:00.000Z",
      },
    }),
  });

  const response = await endpoint({
    request: new Request("https://example.com/api/v1/integration", {
      method: "GET",
      headers: {
        Authorization: "Bearer fam_secret",
        "X-Request-Id": "req_789",
      },
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    integration: {
      id: "setup_123",
      base_url: "https://executor.example",
      ai_api_key_set: false,
      ai_api_key_prefix: null,
      transport: "webhook",
      created_at: "2026-03-25T10:00:00.000Z",
      updated_at: "2026-03-25T10:05:00.000Z",
    },
    request_id: "req_789",
  });
});

test("current integration endpoint updates the executor base url", async () => {
  let capturedUpdate:
    | {
        accountId: string;
        integrationId: string;
        baseUrl: string | null;
        aiApiKey: string | null;
        transport?: "webhook" | "websocket";
      }
    | undefined;

  const endpoint = createHandleCurrentIntegrationEndpoint({
    ...sharedDeps,
    createAccountWithInitialToken: async () => {
      throw new Error("should not create account");
    },
    updateAccountIntegrationBaseUrl: async (input) => {
      capturedUpdate = input;
      return {
        id: input.integrationId,
        baseUrl: input.baseUrl,
        aiApiKey: input.aiApiKey,
        transport: input.transport ?? "webhook",
        createdAt: "2026-03-25T10:00:00.000Z",
        updatedAt: "2026-03-25T10:10:00.000Z",
      };
    },
    authenticateAccountToken: async () => ({
      account: {
        id: "acct_123",
        defaultSetupId: "setup_123",
        // Billing removed for open-source
        createdAt: "2026-03-25T10:00:00.000Z",
      },
      integration: {
        id: "setup_123",
        baseUrl: null,
        aiApiKey: null,
        transport: "webhook" as const,
        createdAt: "2026-03-25T10:00:00.000Z",
        updatedAt: "2026-03-25T10:00:00.000Z",
      },
      token: {
        id: "tok_123",
        prefix: "fam_secr",
        lastFour: "cret",
        createdAt: "2026-03-25T10:00:00.000Z",
        lastUsedAt: "2026-03-25T10:01:00.000Z",
      },
    }),
  });

  const response = await endpoint({
    request: new Request("https://example.com/api/v1/integration", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer fam_secret",
        "Content-Type": "application/json",
        "X-Request-Id": "req_999",
      },
      body: JSON.stringify({
        base_url: "https://executor.example/",
      }),
    }),
  });

  assert.deepEqual(capturedUpdate, {
    accountId: "acct_123",
    integrationId: "setup_123",
    baseUrl: "https://executor.example",
    aiApiKey: null,
    transport: "webhook",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    integration: {
      id: "setup_123",
      base_url: "https://executor.example",
      ai_api_key_set: false,
      ai_api_key_prefix: null,
      transport: "webhook",
      created_at: "2026-03-25T10:00:00.000Z",
      updated_at: "2026-03-25T10:10:00.000Z",
    },
    request_id: "req_999",
  });
});
