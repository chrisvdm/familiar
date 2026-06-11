import assert from "node:assert/strict";
import test from "node:test";
import { createE2EClient } from "./harness.ts";
import { getSharedAccount } from "./shared-account.ts";

const client = createE2EClient();

test("server is reachable", async () => {
  const response = await client.request("/");
  assert.ok(response.ok || response.status === 200, `server returned ${response.status}`);
});

test("POST /api/v1/accounts creates an account and returns a token", async () => {
  const { token, accountId, integrationId } = await getSharedAccount();

  assert.ok(token.startsWith("fam_"), "token should start with fam_");
  assert.ok(accountId.startsWith("acct_"), "accountId should start with acct_");
  assert.ok(integrationId.startsWith("setup_"), "integrationId should start with setup_");
});

test("PATCH /api/v1/integration updates transport", async () => {
  const { token } = await getSharedAccount();

  const patch = await client.setIntegrationConfig(token, { transport: "websocket" });
  assert.equal(patch.status, 200);

  const body = (await patch.json()) as { integration: { transport: string } };
  assert.equal(body.integration.transport, "websocket");
});
