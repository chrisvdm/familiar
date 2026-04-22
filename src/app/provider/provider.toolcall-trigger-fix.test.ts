// worklog: docs/worklogs/2026-04-20-toolcall-trigger-fix.md
import assert from "node:assert/strict";
import test from "node:test";

import {
  interpretPendingToolConfirmation,
  parseToolShortcutInvocation,
  parseToolShortcutInvocations,
} from "./provider.logic.ts";

const makeActiveTool = (toolName: string) => ({
  toolName,
  description: `Tool: ${toolName}`,
  inputSchema: { type: "object" as const, properties: {} },
  policy: {},
  status: "active" as const,
});

// --- hasExplicitToolUseIntent is gone ---

test("hasExplicitToolUseIntent is not exported from provider.logic", async () => {
  const logic = await import("./provider.logic.ts");
  assert.equal(
    "hasExplicitToolUseIntent" in logic,
    false,
    "heuristic gate must not exist",
  );
});

// --- getTodoHeuristicDecision is gone ---

test("extractPendingToolConfirmationRemainder is not exported from provider.logic", async () => {
  const logic = await import("./provider.logic.ts");
  assert.equal(
    "extractPendingToolConfirmationRemainder" in logic,
    false,
    "heuristic remainder function must not exist",
  );
});

test("buildPersonalMemoryReply is not exported from provider.logic", async () => {
  const logic = await import("./provider.logic.ts");
  assert.equal(
    "buildPersonalMemoryReply" in logic,
    false,
    "NLP memory reply heuristic must not exist",
  );
});

// --- @toolname shortcut path is intact ---

test("@toolname shortcut resolves an active tool", () => {
  const result = parseToolShortcutInvocation({
    content: "@TodoList Add dogfood",
    tools: [makeActiveTool("TodoList")],
  });

  assert.equal(result?.tool.toolName, "TodoList");
  assert.equal(result?.remainder, "Add dogfood");
});

test("@toolname shortcut with dot-namespaced tool name resolves correctly", () => {
  const result = parseToolShortcutInvocation({
    content: "@todos.add buy milk",
    tools: [makeActiveTool("todos.add")],
  });

  assert.equal(result?.tool.toolName, "todos.add");
  assert.equal(result?.remainder, "buy milk");
});

test("@toolname shortcut returns null for an unknown tool name", () => {
  const result = parseToolShortcutInvocation({
    content: "@unknownTool do something",
    tools: [makeActiveTool("TodoList")],
  });

  assert.equal(result, null);
});

test("parseToolShortcutInvocations collects multiple @mentions in one message", () => {
  const result = parseToolShortcutInvocations({
    content: "@TodoList Add dogfood @todos.add buy milk",
    tools: [makeActiveTool("TodoList"), makeActiveTool("todos.add")],
  });

  assert.equal(result.length, 2);
  assert.equal(result[0]?.tool.toolName, "TodoList");
  assert.equal(result[1]?.tool.toolName, "todos.add");
});

// --- confirmation interpretation is intact ---

test("confirmation interpretation still works after heuristic removal", () => {
  assert.equal(interpretPendingToolConfirmation("yes"), "confirm");
  assert.equal(interpretPendingToolConfirmation("no"), "reject");
  assert.equal(interpretPendingToolConfirmation("tell me more"), "unknown");
});
