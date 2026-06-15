import assert from "node:assert/strict";
import test from "node:test";

import { createHandleToolAddEndpoint } from "./provider.tool-add.endpoint.core.ts";
import {
  createTestContext,
  okAuth,
  sharedEndpointDeps,
} from "./provider.endpoint.test-helpers.ts";

const isNeverRateLimitError = (
  _error: unknown,
): _error is Error & { retryAfterSeconds: number } => false;

const createRequest = (body: Record<string, unknown>) =>
  new Request("https://example.com/api/v1/tools", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
      "X-Request-Id": "req_123",
    },
    body: JSON.stringify({ user_id: "user_123", ...body }),
  });

const createTool = () => ({
  tool_name: "echo",
  description: "Echoes input back.",
  input_schema: {
    type: "object",
    properties: {
      text: { type: "string" },
    },
    required: ["text"],
  },
});

test("tool add endpoint includes request tracing on success", async () => {
  const endpoint = createHandleToolAddEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: okAuth,
    loadOrCreateProviderUserContext: async () => createTestContext(),
    addProviderTool: async (_input, requestId) => ({
      tool_name: "echo",
      total_tools: 1,
      status: "ok",
      updated: false,
      request_id_seen_by_service: requestId,
    }),
    isProviderRateLimitError: isNeverRateLimitError,
  });

  const response = await endpoint({
    request: createRequest({ tool: createTool() }),
    params: {},
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Request-Id"), "req_123");
  assert.deepEqual(await response.json(), {
    tool_name: "echo",
    total_tools: 1,
    status: "ok",
    updated: false,
    request_id_seen_by_service: "req_123",
    request_id: "req_123",
  });
});

test("tool add endpoint returns 400 for invalid tool payload", async () => {
  const endpoint = createHandleToolAddEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: okAuth,
    loadOrCreateProviderUserContext: async () => createTestContext(),
    addProviderTool: async () => ({ status: "ok" }),
    isProviderRateLimitError: isNeverRateLimitError,
  });

  const response = await endpoint({
    request: createRequest({ tool: { description: "missing tool_name" } }),
    params: {},
  });

  assert.equal(response.status, 400);
  const body = (await response.json()) as { error?: { code: string; message: string } };
  assert.equal(body.error?.code, "invalid_request");
  assert.ok(body.error?.message.includes("tool_name"));
});

test("tool add endpoint returns 405 for non-POST methods", async () => {
  const endpoint = createHandleToolAddEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: okAuth,
    loadOrCreateProviderUserContext: async () => createTestContext(),
    addProviderTool: async () => ({ status: "ok" }),
    isProviderRateLimitError: isNeverRateLimitError,
  });

  const response = await endpoint({
    request: new Request("https://example.com/api/v1/tools", { method: "GET" }),
    params: {},
  });

  assert.equal(response.status, 405);
});
