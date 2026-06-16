import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (path: string) => readFileSync(path, "utf-8");

// ─── Modules that must remain testable in Node.js (no cloudflare:workers) ───

const TESTABLE_MODULES = [
  "src/app/provider/ai-client.ts",
  "src/app/provider/provider.decision.ts",
  "src/app/provider/provider.logic.ts",
  "src/app/provider/provider.http.ts",
  "src/app/provider/provider.types.ts",
  "src/app/provider/provider.rate-limit.ts",
  "src/app/provider/provider.tool-helpers.ts",
];

for (const path of TESTABLE_MODULES) {
  test(`${path} does not import cloudflare:workers`, () => {
    const code = readSource(path);
    assert.ok(
      !code.includes('"cloudflare:workers"'),
      `${path} must remain testable in Node.js and cannot import cloudflare:workers`,
    );
  });
}

// ─── ESM import extension rules ───

const ESM_MODULES = [
  "src/app/provider/ai-client.ts",
  "src/app/provider/provider.decision.ts",
  "src/app/provider/provider.logic.ts",
  "src/app/provider/provider.http.ts",
  "src/app/provider/provider.service.ts",
  "src/app/provider/provider.rate-limit.ts",
  "src/app/provider/provider.tool-helpers.ts",
  "src/app/provider/provider.threads.ts",
  "src/app/provider/provider.memory-runtime.ts",
  "src/app/provider/provider.conversation.ts",
];

for (const path of ESM_MODULES) {
  test(`${path} uses .ts extensions on relative imports`, () => {
    const code = readSource(path);
    const lines = code.split("\n");

    for (const line of lines) {
      const relativeImport = line.match(/from\s+"(\.[^"]+)"/);
      if (!relativeImport) continue;

      const importPath = relativeImport[1];

      // Allow bare directory imports and package imports
      if (!importPath.startsWith(".")) continue;

      // Must end with .ts (or be a directory index)
      assert.ok(
        importPath.endsWith(".ts") || !importPath.includes("."),
        `${path} has relative import missing .ts extension: ${importPath}`,
      );
    }
  });
}

// ─── Factory pattern preservation ───

test("provider.decision.ts exports createDecideConversationAction factory", () => {
  const code = readSource("src/app/provider/provider.decision.ts");
  assert.ok(
    code.includes("export const createDecideConversationAction"),
    "createDecideConversationAction factory must remain exported for DI",
  );
});

test("ai-client.ts exports AiClient type and createDefaultAiClient", () => {
  const code = readSource("src/app/provider/ai-client.ts");
  assert.ok(code.includes("export type AiClient"), "AiClient interface must remain exported");
  assert.ok(
    code.includes("export const createDefaultAiClient"),
    "createDefaultAiClient factory must remain exported",
  );
});

// ─── Prompt immutability guards ───

test("TOOL_DECISION_PROMPT has not drifted", () => {
  const code = readSource("src/app/provider/provider.decision.ts");
  const promptMatch = code.match(/const TOOL_DECISION_PROMPT = ([\s\S]*?);\n/);
  assert.ok(promptMatch, "TOOL_DECISION_PROMPT must exist");

  const prompt = promptMatch[1];
  const hash = Array.from(prompt).reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0);

  // If you intentionally change the prompt, update this hash.
  // This catches agents "improving" prompts without realizing they're part of the API contract.
  const expectedHash = -644745394;

  assert.equal(
    hash,
    expectedHash,
    "TOOL_DECISION_PROMPT changed. If intentional, update the expected hash in architecture.test.ts",
  );
});

// ─── Monolith size guard ───

test("provider.service.ts is under 600 lines", () => {
  const lines = readSource("src/app/provider/provider.service.ts").split("\n").length;
  assert.ok(
    lines < 600,
    `provider.service.ts is ${lines} lines. Extract logic into smaller modules before it grows further.`,
  );
});

test("provider.logic.ts is under 900 lines", () => {
  const lines = readSource("src/app/provider/provider.logic.ts").split("\n").length;
  assert.ok(
    lines < 900,
    `provider.logic.ts is ${lines} lines. Extract logic into smaller modules before it grows further.`,
  );
});

test("provider.threads.ts is under 600 lines", () => {
  const lines = readSource("src/app/provider/provider.threads.ts").split("\n").length;
  assert.ok(
    lines < 600,
    `provider.threads.ts is ${lines} lines. Extract logic into smaller modules before it grows further.`,
  );
});

test("provider.memory-runtime.ts is under 200 lines", () => {
  const lines = readSource("src/app/provider/provider.memory-runtime.ts").split("\n").length;
  assert.ok(
    lines < 200,
    `provider.memory-runtime.ts is ${lines} lines. Extract logic into smaller modules before it grows further.`,
  );
});

test("provider.conversation.ts is under 1700 lines", () => {
  const lines = readSource("src/app/provider/provider.conversation.ts").split("\n").length;
  assert.ok(
    lines < 1700,
    `provider.conversation.ts is ${lines} lines. Extract logic into smaller modules before it grows further.`,
  );
});

test("provider.threads.ts is under 600 lines", () => {
  const lines = readSource("src/app/provider/provider.threads.ts").split("\n").length;
  assert.ok(
    lines < 600,
    `provider.threads.ts is ${lines} lines. Extract logic into smaller modules before it grows further.`,
  );
});

test("provider.memory-runtime.ts is under 200 lines", () => {
  const lines = readSource("src/app/provider/provider.memory-runtime.ts").split("\n").length;
  assert.ok(
    lines < 200,
    `provider.memory-runtime.ts is ${lines} lines. Extract logic into smaller modules before it grows further.`,
  );
});
