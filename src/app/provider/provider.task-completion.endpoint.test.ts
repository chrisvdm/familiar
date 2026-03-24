import assert from "node:assert/strict";
import test from "node:test";

import { createHandleTaskCompletionEndpoint } from "./provider.task-completion.endpoint.core.ts";
import {
  createTestContext,
  okAuth,
  sharedEndpointDeps,
} from "./provider.endpoint.test-helpers.ts";
import type { ProviderTaskCompletionInput } from "./provider.types.ts";

const createCompletionRequest = ({
  body,
  requestId = "req_123",
}: {
  body: ProviderTaskCompletionInput;
  requestId?: string;
}) =>
  new Request("https://example.com/api/v1/tasks/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
      "X-Request-Id": requestId,
    },
    body: JSON.stringify(body),
  });

const createInput = (): ProviderTaskCompletionInput => ({
  provider_id: "provider_a",
  user_id: "user_123",
  thread_id: "thread_123",
  task: {
    tool_name: "todos.add",
    state: "completed",
    content: "Added the todo.",
  },
});

test("task completion endpoint includes request tracing on success", async () => {
  const endpoint = createHandleTaskCompletionEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: () => ({
      ...okAuth(),
      providerConfig: {
        token: "test-token",
      },
    }),
    loadOrCreateProviderUserContext: async () => createTestContext(),
    handleProviderTaskCompletion: async ({ requestId }) => ({
      status: "ok",
      request_id_seen_by_service: requestId,
    }),
  });

  const response = await endpoint({
    request: createCompletionRequest({
      body: createInput(),
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Request-Id"), "req_123");
  assert.deepEqual(await response.json(), {
    status: "ok",
    request_id_seen_by_service: "req_123",
    request_id: "req_123",
  });
});
