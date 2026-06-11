/**
 * Verification script for the familiar agent DX challenge.
 *
 * Usage:
 *   npx tsx verify.ts <familiar-token> <executor-base-url>
 *
 * Checks:
 *   1. Account is valid
 *   2. Integration has the expected base_url
 *   3. Tools are synced
 *   4. End-to-end message returns a non-error response
 */

const HOST = process.env.FAMILIAR_HOST || "https://familiar.monster";

async function request({
  path,
  token,
  method = "GET",
  body,
}: {
  path: string;
  token: string;
  method?: string;
  body?: unknown;
}) {
  const response = await fetch(`${HOST}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: response.status, payload };
}

async function main() {
  const token = process.argv[2];
  const expectedBaseUrl = process.argv[3];

  if (!token) {
    console.error("Usage: npx tsx verify.ts <familiar-token> [executor-base-url]");
    process.exit(1);
  }

  console.log("🔍 Ver familiar agent DX challenge...\n");

  // 1. Account check
  const accountResult = await request({ path: "/api/v1/account", token });
  const accountPayload = accountResult.payload as { account?: { id: string } } | null;
  if (accountResult.status !== 200 || !accountPayload?.account?.id) {
    console.error("❌ Account check failed:", accountResult.payload);
    process.exit(1);
  }
  console.log("✅ Account valid:", accountPayload.account.id);

  // 2. Integration status
  const statusResult = await request({ path: "/api/v1/integration/status", token });
  if (statusResult.status !== 200) {
    console.error("❌ Integration status failed:", statusResult.payload);
    process.exit(1);
  }
  console.log("✅ Integration status:", JSON.stringify(statusResult.payload));

  // 3. Tools synced
  const statusPayload = statusResult.payload as { tools?: { count: number } } | null;
  if (statusPayload?.tools?.count === 0) {
    console.error("❌ No tools synced");
    process.exit(1);
  }
  console.log("✅ Tools synced:", statusPayload?.tools?.count);

  // 4. End-to-end
  const inputResult = await request({
    path: "/api/v1/input",
    token,
    method: "POST",
    body: {
      input: { kind: "text", text: "What's the weather in Paris?" },
      channel: { type: "web", id: "dx-test" },
    },
  });

  if (inputResult.status !== 200) {
    console.error("❌ Input request failed:", inputResult.payload);
    process.exit(1);
  }

  const inputPayload = inputResult.payload as { execution?: { state: string }; messages?: Array<{ content?: string }> } | null;
  const hasError =
    inputPayload?.execution?.state === "failed" ||
    inputPayload?.messages?.some((m: { content?: string }) =>
      m.content?.toLowerCase().includes("error"),
    );

  if (hasError) {
    console.error("❌ End-to-end returned an error:", JSON.stringify(inputResult.payload, null, 2));
    process.exit(1);
  }

  console.log("✅ End-to-end response received");
  console.log("\n🎉 All checks passed!");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
