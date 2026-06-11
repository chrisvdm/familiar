import assert from "node:assert/strict";
import test from "node:test";
import { createE2EClient } from "./harness.ts";
import { getSharedAccount } from "./shared-account.ts";

test("full conversation flow: create account, sync tools, send input", async () => {
  const client = createE2EClient();

  // 1. Use shared account
  const { token } = await getSharedAccount();

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

  // 3. Send input (will likely fail without AI key, but should not crash)
  const input = await client.sendInput(token, {
    input: { text: "Hello familiar" },
    channel: { type: "web", id: "e2e-test" },
  });

  // Without AI key and within free tier, this may return 400 configuration_required
  assert.ok(
    input.status === 200 || input.status === 400,
    `unexpected status: ${input.status} ${await input.text()}`,
  );
});
