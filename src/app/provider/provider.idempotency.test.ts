import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyGlobalMemory } from "../chat/shared.ts";

import {
  buildIdempotencyKey,
  normalizeIdempotencyMap,
  readIdempotencyReplay,
  storeIdempotencyReplay,
} from "./provider.idempotency.ts";
import type { ProviderUserContext } from "./provider.types.ts";

const createTestContext = (): ProviderUserContext => ({
  providerId: "provider_a",
  userId: "user_123",
  selectedModel: "openai/gpt-4o-mini",
  memoryPolicy: {
    mode: "provider_user",
  },
  globalMemory: createEmptyGlobalMemory(),
  threads: [],
  allowedTools: [],
  channels: {},
  requestLog: {
    conversationInputTimestamps: [],
  },
  idempotency: {},
  createdAt: "2026-03-19T10:00:00.000Z",
  updatedAt: "2026-03-19T10:00:00.000Z",
});

test("buildIdempotencyKey namespaces by method and path", () => {
  const result = buildIdempotencyKey({
    method: "post",
    path: "/api/v1/conversation/input",
    idempotencyKey: "abc123",
  });

  assert.equal(result, "POST:/api/v1/conversation/input:abc123");
});

test("readIdempotencyReplay returns replay for matching hash", () => {
  const context = storeIdempotencyReplay({
    context: createTestContext(),
    storageKey: "POST:/api/v1/threads:key-1",
    requestHash: "hash-1",
    status: 200,
    body: {
      thread_id: "thread_1",
    },
    now: new Date().toISOString(),
  });

  const result = readIdempotencyReplay({
    context,
    storageKey: "POST:/api/v1/threads:key-1",
    requestHash: "hash-1",
  });

  assert.deepEqual(result, {
    kind: "replay",
    status: 200,
    body: {
      thread_id: "thread_1",
    },
  });
});

test("readIdempotencyReplay returns conflict for reused key with different hash", () => {
  const context = storeIdempotencyReplay({
    context: createTestContext(),
    storageKey: "POST:/api/v1/threads:key-1",
    requestHash: "hash-1",
    status: 200,
    body: {
      thread_id: "thread_1",
    },
    now: new Date().toISOString(),
  });

  const result = readIdempotencyReplay({
    context,
    storageKey: "POST:/api/v1/threads:key-1",
    requestHash: "hash-2",
  });

  assert.deepEqual(result, {
    kind: "conflict",
  });
});

test("normalizeIdempotencyMap drops stale entries", () => {
  const result = normalizeIdempotencyMap(
    {
      stale: {
        requestHash: "hash-1",
        status: 200,
        body: {},
        createdAt: "2026-03-17T09:00:00.000Z",
      },
      fresh: {
        requestHash: "hash-2",
        status: 200,
        body: {},
        createdAt: "2026-03-19T09:30:00.000Z",
      },
    },
    Date.parse("2026-03-19T10:00:00.000Z"),
  );

  assert.deepEqual(Object.keys(result), ["fresh"]);
});
