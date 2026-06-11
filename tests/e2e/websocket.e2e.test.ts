import assert from "node:assert/strict";
import test from "node:test";
import { createE2EClient, waitForWebSocketMessage } from "./harness.ts";
import { getSharedAccount } from "./shared-account.ts";

const client = createE2EClient();

test("websocket executor transport: connects and relays execution requests", async () => {
  const { token } = await getSharedAccount();

  // 1. Configure for WebSocket transport
  const patch = await client.setIntegrationConfig(token, { transport: "websocket" });
  assert.equal(patch.status, 200, `set transport failed: ${await patch.text()}`);

  // 2. Sync a simple echo tool
  const sync = await client.syncTools(token, [
    {
      tool_name: "echo",
      description: "Echoes back the input text.",
      input_schema: {
        type: "object",
        properties: {
          text: { type: "string" },
        },
        required: ["text"],
      },
    },
  ]);
  assert.equal(sync.status, 200, `tool sync failed: ${await sync.text()}`);

  // 3. Open WebSocket connection to executor
  const ws = client.connectWebSocket(token);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket connection timed out")), 5_000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("WebSocket connection failed"));
    });
  });

  // 4. Send conversation input using shortcut syntax to force tool invocation
  const inputPromise = client.sendInput(token, {
    input: { text: "@echo hello websocket" },
    channel: { type: "web", id: "e2e-websocket-test" },
  });

  // 5. Wait for execution request to arrive on WebSocket
  const executionRequest = (await waitForWebSocketMessage(ws, 20_000)) as {
    execution_id: string;
    tool_name: string;
    arguments: Record<string, unknown>;
  };

  assert.ok(executionRequest.execution_id, "execution_id should be present");
  assert.equal(executionRequest.tool_name, "echo", `expected tool 'echo', got ${executionRequest.tool_name}`);

  // 6. Send execution result back through WebSocket
  ws.send(
    JSON.stringify({
      execution_id: executionRequest.execution_id,
      ok: true,
      state: "completed",
      result: {
        summary: "Echo: hello websocket",
        data: { echoed: true },
      },
    }),
  );

  // 7. Wait for conversation response
  const inputResponse = await inputPromise;
  const responseText = await inputResponse.text();
  assert.equal(inputResponse.status, 200, `conversation input failed: ${responseText}`);

  const body = JSON.parse(responseText) as { response?: { content?: string } };
  assert.ok(body.response?.content, "response content should be present");

  ws.close();
});

test("websocket executor transport: rejects connection when transport is webhook", async () => {
  const { token } = await getSharedAccount();

  // Ensure transport is webhook (default)
  const patch = await client.setIntegrationConfig(token, { transport: "webhook" });
  assert.equal(patch.status, 200);

  const ws = client.connectWebSocket(token);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Expected WebSocket to close with error")), 5_000);
    ws.addEventListener("close", (event) => {
      clearTimeout(timer);
      if (event.code === 1006 || event.code === 1002) {
        resolve();
      } else {
        resolve();
      }
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      ws.close();
      reject(new Error("WebSocket should not open when transport is webhook"));
    });
  });
});
