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
    createdAt: "2026-03-25T10:00:00.000Z",
    updatedAt: "2026-03-25T10:05:00.000Z",
  }),
  createCliSession: async () => ({ sessionId: "cli_123", expiresAt: "2026-03-25T11:00:00.000Z" }),
  completeCliSession: async () => ({ value: "ok" as const }),
  pollCliSession: async () => ({ state: "pending" as const }),
  getAccountUsage: async () => ({ actionCount: 0, freeActionsUsed: 0, freeActionsRemaining: 10, plan: "free" as const }),
  getIntegrationStatus: async () => ({ toolCount: 0, threadCount: 0 }),
};

test("create account endpoint returns account and first token", async () => {
  const endpoint = createHandleCreateAccountEndpoint({
    ...sharedDeps,
    authenticateAccountToken: async () => null,
    createAccountWithInitialToken: async () => ({
      account: {
        id: "acct_123",
        defaultSetupId: "setup_123",
        actionCount: 0,
        freeActionsUsed: 0,
        plan: "free",
        createdAt: "2026-03-25T10:00:00.000Z",
      },
      integration: {
        id: "setup_123",
        baseUrl: null,
        aiApiKey: null,
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
    request_id: "req_123",
  });
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
        actionCount: 0,
        freeActionsUsed: 0,
        plan: "free",
        createdAt: "2026-03-25T10:00:00.000Z",
      },
      integration: {
        id: "setup_123",
        baseUrl: "https://executor.example",
        aiApiKey: null,
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
        actionCount: 0,
        freeActionsUsed: 0,
        plan: "free",
        createdAt: "2026-03-25T10:00:00.000Z",
      },
      integration: {
        id: "setup_123",
        baseUrl: "https://executor.example",
        aiApiKey: null,
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
        createdAt: "2026-03-25T10:00:00.000Z",
        updatedAt: "2026-03-25T10:10:00.000Z",
      };
    },
    authenticateAccountToken: async () => ({
      account: {
        id: "acct_123",
        defaultSetupId: "setup_123",
        actionCount: 0,
        freeActionsUsed: 0,
        plan: "free",
        createdAt: "2026-03-25T10:00:00.000Z",
      },
      integration: {
        id: "setup_123",
        baseUrl: null,
        aiApiKey: null,
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
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    integration: {
      id: "setup_123",
      base_url: "https://executor.example",
      ai_api_key_set: false,
      ai_api_key_prefix: null,
      created_at: "2026-03-25T10:00:00.000Z",
      updated_at: "2026-03-25T10:10:00.000Z",
    },
    request_id: "req_999",
  });
});
