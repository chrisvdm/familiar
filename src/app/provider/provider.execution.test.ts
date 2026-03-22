import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExecutorToolUrl,
  executeProviderToolRequest,
  normalizeProviderToolExecution,
} from "./provider.execution.ts";

test("buildExecutorToolUrl appends tools execute path once", () => {
  assert.equal(
    buildExecutorToolUrl("https://executor.example/root/"),
    "https://executor.example/root/tools/execute",
  );
});

test("normalizeProviderToolExecution treats invalid states as failed", () => {
  const result = normalizeProviderToolExecution({
    responseOk: true,
    payload: {
      ok: true,
      state: "not_real" as never,
    },
  });

  assert.deepEqual(result, {
    state: "failed",
    message: "The executor returned an invalid execution state.",
    data: null,
  });
});

test("executeProviderToolRequest returns failed for invalid JSON responses", async () => {
  const result = await executeProviderToolRequest({
    providerConfig: {
      token: "dev-token",
      baseUrl: "https://executor.example",
    },
    providerId: "provider_a",
    userId: "user_123",
    threadId: "thread_123",
    toolName: "spreadsheet.update_row",
    args: {},
    fetchImpl: async () =>
      ({
        ok: true,
        json: async () => {
          throw new Error("bad json");
        },
      }) as unknown as Response,
  });

  assert.deepEqual(result, {
    state: "failed",
    message: "The executor returned an invalid JSON response.",
    data: null,
  });
});

test("executeProviderToolRequest returns failed for unreachable executors", async () => {
  const result = await executeProviderToolRequest({
    providerConfig: {
      token: "dev-token",
      baseUrl: "https://executor.example",
    },
    providerId: "provider_a",
    userId: "user_123",
    threadId: "thread_123",
    toolName: "spreadsheet.update_row",
    args: {},
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });

  assert.deepEqual(result, {
    state: "failed",
    message: "The executor could not be reached.",
    data: null,
  });
});

test("executeProviderToolRequest returns normalized success payloads", async () => {
  let capturedRequestUrl = "";
  let capturedBody = "";

  const result = await executeProviderToolRequest({
    providerConfig: {
      token: "dev-token",
      baseUrl: "https://executor.example/root/",
    },
    providerId: "provider_a",
    userId: "user_123",
    threadId: "thread_123",
    toolName: "spreadsheet.update_row",
    args: {
      row_id: "42",
    },
    requestId: "req_123",
    fetchImpl: async (input, init) => {
      capturedRequestUrl = String(input);
      capturedBody = String(init?.body);

      return {
        ok: true,
        json: async () => ({
          ok: true,
          state: "completed",
          result: {
            summary: "Updated row 42.",
            data: {
              row_id: "42",
            },
          },
        }),
      } as unknown as Response;
    },
  });

  assert.equal(
    capturedRequestUrl,
    "https://executor.example/root/tools/execute",
  );
  assert.match(capturedBody, /"request_id":"req_123"/);
  assert.deepEqual(result, {
    state: "completed",
    message: "Updated row 42.",
    data: {
      row_id: "42",
    },
  });
});
