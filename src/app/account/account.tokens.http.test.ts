import assert from "node:assert/strict";
import test from "node:test";
import {
  createHandleRevokeTokenEndpoint,
  createHandleTokensEndpoint,
} from "./account.tokens.http.ts";

const createRequest = ({
  method = "GET",
  token = "test-token",
  body,
}: {
  method?: string;
  token?: string;
  body?: Record<string, unknown>;
} = {}) =>
  new Request("https://example.com/api/v1/tokens", {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      "X-Request-Id": "req_123",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const okAuth = async () => ({
  account: { id: "acct_123" },
  integration: { id: "setup_123" },
});

const createTokenInfo = (overrides: Partial<{ id: string; revokedAt: string | null }> = {}) => ({
  id: overrides.id ?? "tok_123",
  accountId: "acct_123",
  prefix: "fam_abc",
  lastFour: "1234",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastUsedAt: null,
  revokedAt: overrides.revokedAt ?? null,
});

test("tokens endpoint lists tokens", async () => {
  const tokens = [createTokenInfo()];

  const endpoint = createHandleTokensEndpoint({
    getRequestId: () => "req_123",
    authenticateAccountToken: okAuth,
    listAccountTokens: async () => tokens,
    createAccountToken: async () => ({ value: "fam_new", token: createTokenInfo({ id: "tok_new" }) }),
    revokeAccountToken: async () => createTokenInfo({ revokedAt: "2026-01-02T00:00:00.000Z" }),
  });

  const response = await endpoint({
    request: createRequest({ method: "GET" }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { tokens: Array<{ id: string }> };
  assert.equal(body.tokens.length, 1);
  assert.equal(body.tokens[0].id, "tok_123");
});

test("tokens endpoint creates a token", async () => {
  const endpoint = createHandleTokensEndpoint({
    getRequestId: () => "req_123",
    authenticateAccountToken: okAuth,
    listAccountTokens: async () => [],
    createAccountToken: async () => ({ value: "fam_new_token", token: createTokenInfo({ id: "tok_new" }) }),
    revokeAccountToken: async () => createTokenInfo(),
  });

  const response = await endpoint({
    request: createRequest({ method: "POST" }),
  });

  assert.equal(response.status, 201);
  const body = (await response.json()) as { token: { value: string; id: string } };
  assert.equal(body.token.value, "fam_new_token");
  assert.equal(body.token.id, "tok_new");
});

test("tokens endpoint rejects unauthenticated requests", async () => {
  const endpoint = createHandleTokensEndpoint({
    getRequestId: () => "req_123",
    authenticateAccountToken: async () => null,
    listAccountTokens: async () => [],
    createAccountToken: async () => ({ value: "", token: createTokenInfo() }),
    revokeAccountToken: async () => createTokenInfo(),
  });

  const response = await endpoint({
    request: createRequest({ method: "GET", token: "" }),
  });

  assert.equal(response.status, 401);
});

test("tokens endpoint rejects unsupported methods", async () => {
  const endpoint = createHandleTokensEndpoint({
    getRequestId: () => "req_123",
    authenticateAccountToken: okAuth,
    listAccountTokens: async () => [],
    createAccountToken: async () => ({ value: "", token: createTokenInfo() }),
    revokeAccountToken: async () => createTokenInfo(),
  });

  const response = await endpoint({
    request: createRequest({ method: "PATCH" }),
  });

  assert.equal(response.status, 405);
});

test("revoke token endpoint revokes a token", async () => {
  const endpoint = createHandleRevokeTokenEndpoint({
    getRequestId: () => "req_123",
    authenticateAccountToken: okAuth,
    listAccountTokens: async () => [],
    createAccountToken: async () => ({ value: "", token: createTokenInfo() }),
    revokeAccountToken: async () => createTokenInfo({ revokedAt: "2026-01-02T00:00:00.000Z" }),
  });

  const response = await endpoint({
    request: createRequest({ method: "DELETE" }),
    params: { tokenId: "tok_123" },
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { token: { revoked_at: string } };
  assert.ok(body.token.revoked_at);
});

test("revoke token endpoint rejects missing token id", async () => {
  const endpoint = createHandleRevokeTokenEndpoint({
    getRequestId: () => "req_123",
    authenticateAccountToken: okAuth,
    listAccountTokens: async () => [],
    createAccountToken: async () => ({ value: "", token: createTokenInfo() }),
    revokeAccountToken: async () => createTokenInfo(),
  });

  const response = await endpoint({
    request: createRequest({ method: "DELETE" }),
    params: {},
  });

  assert.equal(response.status, 400);
});
