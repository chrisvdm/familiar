import assert from "node:assert/strict";
import test from "node:test";

import { createHandleThreadMutationEndpoint } from "./provider.thread-mutation.endpoint.core.ts";
import {
  buildIdempotencyKey,
  createReplayContext,
  createTestContext,
  okAuth,
  sharedEndpointDeps,
} from "./provider.endpoint.test-helpers.ts";

const createRequest = ({
  method,
  body,
  idempotencyKey,
  path = "https://example.com/api/v1/threads/thread_123",
}: {
  method: "PATCH" | "DELETE";
  body: {
    integration_id: string;
    user_id?: string;
    thread_id?: string;
    title?: string;
  };
  idempotencyKey?: string;
  path?: string;
}) =>
  new Request(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
      "X-Request-Id": "req_123",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });

const createInput = () => ({
  integration_id: "provider_a",
  user_id: "user_123" as string | undefined,
  thread_id: "thread_123" as string | undefined,
  title: "Renamed thread",
});

test("thread mutation endpoint renames with request tracing", async () => {
  const endpoint = createHandleThreadMutationEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: okAuth,
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: () => ({ kind: "miss" }),
    storeIdempotencyReplay: ({ context }) => context,
    renameProviderThread: async () => ({
      thread_id: "thread_123",
      title: "Renamed thread",
    }),
    deleteProviderThread: async () => ({
      deleted: true,
    }),
  });

  const response = await endpoint({
    request: createRequest({
      method: "PATCH",
      body: createInput(),
    }),
    params: {
      threadId: "thread_123",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Request-Id"), "req_123");
  assert.deepEqual(await response.json(), {
    thread_id: "thread_123",
    title: "Renamed thread",
    request_id: "req_123",
  });
});

test("thread mutation endpoint deletes with idempotent replay", async () => {
  const storageKey = buildIdempotencyKey({
    method: "DELETE",
    path: "/api/v1/threads/thread_123",
    idempotencyKey: "idem_123",
  });
  const context = createReplayContext({
    storageKey,
    requestHash: "hash_123",
    status: 200,
    body: {
      deleted: true,
    },
  });

  const endpoint = createHandleThreadMutationEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: okAuth,
    loadOrCreateProviderUserContext: async () => context,
    saveProviderUserContext: async (value) => value,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: ({ context, storageKey, requestHash }) => {
      const entry = context.idempotency[storageKey];

      if (entry?.requestHash === requestHash) {
        return {
          kind: "replay" as const,
          status: entry.status,
          body: entry.body,
        };
      }

      return { kind: "miss" as const };
    },
    storeIdempotencyReplay: ({ context }) => context,
    renameProviderThread: async () => ({
      thread_id: "thread_123",
    }),
    deleteProviderThread: async () => {
      throw new Error("should not delete on replay");
    },
  });

  const response = await endpoint({
    request: createRequest({
      method: "DELETE",
      body: {
        integration_id: "provider_a",
        user_id: "user_123",
      },
      idempotencyKey: "idem_123",
    }),
    params: {
      threadId: "thread_123",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Idempotent-Replay"), "true");
  assert.deepEqual(await response.json(), {
    deleted: true,
    request_id: "req_123",
  });
});

test("thread mutation endpoint rejects idempotency conflicts", async () => {
  const endpoint = createHandleThreadMutationEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: okAuth,
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_456",
    readIdempotencyReplay: () => ({ kind: "conflict" }),
    storeIdempotencyReplay: ({ context }) => context,
    renameProviderThread: async () => ({
      thread_id: "thread_123",
    }),
    deleteProviderThread: async () => ({
      deleted: true,
    }),
  });

  const response = await endpoint({
    request: createRequest({
      method: "PATCH",
      body: createInput(),
      idempotencyKey: "idem_conflict",
    }),
    params: {
      threadId: "thread_123",
    },
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: {
      code: "idempotency_conflict",
      message: "Idempotency key was reused with a different request body.",
      details: null,
    },
    request_id: "req_123",
  });
});

test("thread mutation endpoint can derive user_id from authenticated account", async () => {
  let seenUserId: string | undefined;

  const endpoint = createHandleThreadMutationEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: () => ({
      ...okAuth(),
      accountId: "acct_123",
    }),
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: () => ({ kind: "miss" }),
    storeIdempotencyReplay: ({ context }) => context,
    renameProviderThread: async ({ userId }) => {
      seenUserId = userId;
      return {
        thread_id: "thread_123",
      };
    },
    deleteProviderThread: async () => ({
      deleted: true,
    }),
  });

  const body = createInput();
  delete body.user_id;

  const response = await endpoint({
    request: createRequest({
      method: "PATCH",
      body,
    }),
    params: {
      threadId: "thread_123",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(seenUserId, "acct_123");
});

test("thread mutation endpoint accepts payload-first thread_id on /api/v1/threads", async () => {
  let seenThreadId: string | undefined;

  const endpoint = createHandleThreadMutationEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: okAuth,
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: () => ({ kind: "miss" }),
    storeIdempotencyReplay: ({ context }) => context,
    renameProviderThread: async ({ threadId }) => {
      seenThreadId = threadId;
      return {
        thread_id: threadId,
      };
    },
    deleteProviderThread: async () => ({
      deleted: true,
    }),
  });

  const response = await endpoint({
    request: createRequest({
      method: "PATCH",
      path: "https://example.com/api/v1/threads",
      body: {
        integration_id: "provider_a",
        user_id: "user_123",
        thread_id: "thread_payload",
        title: "Renamed thread",
      },
    }),
    params: {},
  });

  assert.equal(response.status, 200);
  assert.equal(seenThreadId, "thread_payload");
});

test("thread deletion endpoint accepts payload-first thread_id on /api/v1/threads", async () => {
  let seenThreadId: string | undefined;

  const endpoint = createHandleThreadMutationEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: okAuth,
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: () => ({ kind: "miss" }),
    storeIdempotencyReplay: ({ context }) => context,
    renameProviderThread: async () => ({
      thread_id: "thread_123",
    }),
    deleteProviderThread: async ({ threadId }) => {
      seenThreadId = threadId;
      return {
        deleted: true,
      };
    },
  });

  const response = await endpoint({
    request: createRequest({
      method: "DELETE",
      path: "https://example.com/api/v1/threads",
      body: {
        integration_id: "provider_a",
        user_id: "user_123",
        thread_id: "thread_payload",
      },
    }),
    params: {},
  });

  assert.equal(response.status, 200);
  assert.equal(seenThreadId, "thread_payload");
});
