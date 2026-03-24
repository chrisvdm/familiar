import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExecutorToolUrl,
  buildProviderChannelMessageUrl,
  executeProviderToolRequest,
  normalizeProviderToolExecution,
  sendProviderChannelMessage,
} from "./provider.execution.ts";

test("buildExecutorToolUrl appends tools execute path once", () => {
  assert.equal(
    buildExecutorToolUrl("https://executor.example/root/"),
    "https://executor.example/root/tools/execute",
  );
});

test("buildProviderChannelMessageUrl appends channel message path once", () => {
  assert.equal(
    buildProviderChannelMessageUrl("https://executor.example/root/"),
    "https://executor.example/root/channels/messages",
  );
});

test("normalizeProviderToolExecution treats invalid states as failed", () => {
  const result = normalizeProviderToolExecution({
    executionId: "exec_123",
    responseOk: true,
    payload: {
      ok: true,
      state: "not_real" as never,
    },
  });

  assert.deepEqual(result, {
    executionId: "exec_123",
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

  assert.equal(result.executionId.length > 0, true);
  assert.deepEqual(
    {
      state: result.state,
      message: result.message,
      data: result.data,
    },
    {
      state: "failed",
      message: "The executor returned an invalid JSON response.",
      data: null,
    },
  );
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

  assert.equal(result.executionId.length > 0, true);
  assert.deepEqual(
    {
      state: result.state,
      message: result.message,
      data: result.data,
    },
    {
      state: "failed",
      message: "The executor could not be reached.",
      data: null,
    },
  );
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
    channel: {
      type: "whatsapp",
      id: "user_555",
    },
    resultWebhookUrl: "https://texty.example/api/v1/webhooks/executor",
    rawInputText: "buy milk and eggs",
    shortcutMode: true,
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
  assert.match(capturedBody, /"executor_result_webhook_url":"https:\/\/texty.example\/api\/v1\/webhooks\/executor"/);
  assert.match(capturedBody, /"raw_input_text":"buy milk and eggs"/);
  assert.match(capturedBody, /"shortcut_mode":true/);
  assert.equal(result.executionId.length > 0, true);
  assert.match(
    capturedBody,
    new RegExp(`"execution_id":"${result.executionId}"`),
  );
  assert.deepEqual(
    {
      state: result.state,
      message: result.message,
      data: result.data,
    },
    {
      state: "completed",
      message: "Updated row 42.",
      data: {
        row_id: "42",
      },
    },
  );
});

test("executeProviderToolRequest supports integration-defined executor payload templates", async () => {
  let capturedBody = "";

  await executeProviderToolRequest({
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
    channel: {
      type: "whatsapp",
      id: "user_555",
    },
    resultWebhookUrl: "https://texty.example/api/v1/webhooks/executor",
    rawInputText: "buy milk and eggs",
    shortcutMode: true,
    executorPayloadTemplate: {
      operation: "$tool_name",
      params: "$arguments",
      meta: {
        user: "$user_id",
        request: "$request_id",
        callback: "$executor_result_webhook_url",
      },
    },
    fetchImpl: async (_input, init) => {
      capturedBody = String(init?.body);

      return {
        ok: true,
        json: async () => ({
          ok: true,
          state: "completed",
          result: {
            summary: "Updated row 42.",
          },
        }),
      } as unknown as Response;
    },
  });

  assert.match(capturedBody, /"operation":"spreadsheet.update_row"/);
  assert.match(capturedBody, /"params":\{"row_id":"42"\}/);
  assert.match(capturedBody, /"user":"user_123"/);
  assert.match(capturedBody, /"request":"req_123"/);
  assert.match(
    capturedBody,
    /"callback":"https:\/\/texty.example\/api\/v1\/webhooks\/executor"/,
  );
  assert.doesNotMatch(capturedBody, /"tool_name":"spreadsheet.update_row"/);
  assert.doesNotMatch(capturedBody, /"arguments":\{"row_id":"42"\}/);
});

test("sendProviderChannelMessage posts a text message payload", async () => {
  let capturedRequestUrl = "";
  let capturedBody = "";

  const result = await sendProviderChannelMessage({
    providerConfig: {
      token: "dev-token",
      baseUrl: "https://executor.example/root/",
    },
    providerId: "provider_a",
    userId: "user_123",
    threadId: "thread_123",
    channel: {
      type: "whatsapp",
      id: "user_555",
    },
    content: "Task completed.",
    task: {
      executionId: "exec_123",
      toolName: "todos.add",
      state: "completed",
      data: {
        added: 1,
      },
    },
    requestId: "req_456",
    fetchImpl: async (input, init) => {
      capturedRequestUrl = String(input);
      capturedBody = String(init?.body);
      return {
        ok: true,
      } as Response;
    },
  });

  assert.equal(result, true);
  assert.equal(
    capturedRequestUrl,
    "https://executor.example/root/channels/messages",
  );
  assert.match(capturedBody, /"text":"Task completed\."/);
  assert.match(capturedBody, /"tool_name":"todos.add"/);
  assert.match(capturedBody, /"execution_id":"exec_123"/);
});
