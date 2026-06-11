import assert from "node:assert/strict";
import test from "node:test";
import type { AiClient } from "./ai-client.ts";
import { createDecideConversationAction } from "./provider.decision.ts";

const makeTool = (
  overrides: Partial<{
    toolName: string;
    description: string;
    inputSchema: Record<string, unknown>;
    status: "active" | "disabled";
  }> = {},
): import("./provider.types.ts").AllowedTool => ({
  toolName: "todo.add",
  description: "Add a todo item",
  inputSchema: {
    type: "object",
    properties: {
      item: { type: "string" },
    },
    required: ["item"],
  },
  status: "active",
  policy: {},
  ...overrides,
});

const makeMockAiClient = (overrides: Partial<AiClient> = {}): AiClient => ({
  route: async () => '{"tool":"none","arguments":{},"reasoning":"test","confidence":0}',
  extract: async () => '{"arguments":{}}',
  reply: async () => "Hello!",
  replyStream: async function* () {
    yield "Hello!";
  },
  ...overrides,
});

// ─── Happy path: no active tools → direct reply ──────────────────────────────

test("decideConversationAction with no active tools returns direct reply", async () => {
  const aiClient = makeMockAiClient();
  const decide = createDecideConversationAction({ aiClient });

  const decision = await decide({
    content: "hello",
    messages: [],
    memoryContext: null,
    tools: [{ ...makeTool(), status: "disabled" }],
    replyModel: "openai/gpt-4o-mini",
  });

  assert.equal(decision.action, "direct_reply");
  assert.equal(decision.reply, "Hello!");
});

// ─── Happy path: tool routing with high confidence → tool call ───────────────

test("decideConversationAction routes to tool call with complete args", async () => {
  const aiClient = makeMockAiClient({
    route: async () =>
      '{"tool":"todo.add","arguments":{"item":"buy milk"},"reasoning":"User wants to add a todo","confidence":0.95}',
  });
  const decide = createDecideConversationAction({ aiClient });

  const decision = await decide({
    content: "add buy milk to my todos",
    messages: [],
    memoryContext: null,
    tools: [makeTool()],
    replyModel: "openai/gpt-4o-mini",
  });

  assert.equal(decision.action, "tool_call");
  assert.equal(decision.tool_name, "todo.add");
  assert.deepEqual(decision.arguments, { item: "buy milk" });
  assert.equal(decision.confidence, 0.95);
});

// ─── Happy path: missing required args → tool_follow_up ──────────────────────

test("decideConversationAction returns follow_up when args are incomplete", async () => {
  const aiClient = makeMockAiClient({
    route: async () =>
      '{"tool":"todo.add","arguments":{},"reasoning":"Need item","confidence":0.9,"follow_up":"What should I add?"}',
  });
  const decide = createDecideConversationAction({ aiClient });

  const decision = await decide({
    content: "add a todo",
    messages: [],
    memoryContext: null,
    tools: [makeTool()],
    replyModel: "openai/gpt-4o-mini",
  });

  assert.equal(decision.action, "tool_follow_up");
  assert.equal(decision.tool_name, "todo.add");
  assert.equal(decision.question, "I still need item before I can use todo.add.");
});

// ─── Happy path: low confidence → clarification (confirmation prompt) ────────

test("decideConversationAction returns tool_call with low confidence when args are complete", async () => {
  const aiClient = makeMockAiClient({
    route: async () =>
      '{"tool":"todo.add","arguments":{"item":"buy milk"},"reasoning":"Unsure","confidence":0.5}',
  });
  const decide = createDecideConversationAction({ aiClient });

  const decision = await decide({
    content: "maybe add milk?",
    messages: [],
    memoryContext: null,
    tools: [makeTool()],
    replyModel: "openai/gpt-4o-mini",
  });

  assert.equal(decision.action, "tool_call");
  assert.equal(decision.confidence, 0.5);
});

// ─── Happy path: no tool match → clarification ───────────────────────────────

test("decideConversationAction returns clarification when tool is unknown", async () => {
  const aiClient = makeMockAiClient({
    route: async () =>
      '{"tool":"unknown.tool","arguments":{},"reasoning":"Not sure","confidence":0.8}',
  });
  const decide = createDecideConversationAction({ aiClient });

  const decision = await decide({
    content: "do something weird",
    messages: [],
    memoryContext: null,
    tools: [makeTool()],
    replyModel: "openai/gpt-4o-mini",
  });

  assert.equal(decision.action, "clarification");
  assert.ok(decision.question?.includes("could not match"));
});

// ─── Happy path: user says none → direct reply ───────────────────────────────

test("decideConversationAction returns direct reply when tool is none", async () => {
  const aiClient = makeMockAiClient();
  const decide = createDecideConversationAction({ aiClient });

  const decision = await decide({
    content: "just chatting",
    messages: [],
    memoryContext: null,
    tools: [makeTool()],
    replyModel: "openai/gpt-4o-mini",
  });

  assert.equal(decision.action, "direct_reply");
  assert.equal(decision.reply, "Hello!");
});

// ─── Failure path: invalid JSON from LLM → falls back to raw text as direct reply ─

test("decideConversationAction falls back to raw text on invalid JSON", async () => {
  const aiClient = makeMockAiClient({
    route: async () => "just a plain text response",
  });
  const decide = createDecideConversationAction({ aiClient });

  const decision = await decide({
    content: "hello",
    messages: [],
    memoryContext: null,
    tools: [makeTool()],
    replyModel: "openai/gpt-4o-mini",
  });

  assert.equal(decision.action, "direct_reply");
  assert.equal(decision.reply, "just a plain text response");
});

// ─── Interface isolation: swapping AiClient preserves routing logic ──────────

test("swapping AiClient implementation does not change routing logic", async () => {
  const clientA = makeMockAiClient({
    route: async () =>
      '{"tool":"todo.add","arguments":{"item":"A"},"reasoning":"test","confidence":0.95}',
  });
  const clientB = makeMockAiClient({
    route: async () =>
      '{"tool":"todo.add","arguments":{"item":"B"},"reasoning":"test","confidence":0.95}',
  });

  const decideA = createDecideConversationAction({ aiClient: clientA });
  const decideB = createDecideConversationAction({ aiClient: clientB });

  const decisionA = await decideA({
    content: "add a todo",
    messages: [],
    memoryContext: null,
    tools: [makeTool()],
    replyModel: "openai/gpt-4o-mini",
  });

  const decisionB = await decideB({
    content: "add a todo",
    messages: [],
    memoryContext: null,
    tools: [makeTool()],
    replyModel: "openai/gpt-4o-mini",
  });

  // Both should route to tool_call with the same shape
  assert.equal(decisionA.action, "tool_call");
  assert.equal(decisionB.action, "tool_call");
  assert.equal(decisionA.tool_name, "todo.add");
  assert.equal(decisionB.tool_name, "todo.add");
  // But the arguments come from different clients
  assert.deepEqual(decisionA.arguments, { item: "A" });
  assert.deepEqual(decisionB.arguments, { item: "B" });
});

// ─── generateReply=false skips LLM reply ─────────────────────────────────────

test("decideConversationAction with generateReply=false returns empty direct reply", async () => {
  const aiClient = makeMockAiClient();
  const decide = createDecideConversationAction({ aiClient });

  const decision = await decide({
    content: "hello",
    messages: [],
    memoryContext: null,
    tools: [],
    replyModel: "openai/gpt-4o-mini",
    generateReply: false,
  });

  assert.equal(decision.action, "direct_reply");
  assert.equal(decision.reply, "");
});

// ─── Factory wrappers create independent instances ────────────────────────────

test("factory wrappers create independent aiClient bindings", async () => {
  let routeCallCountA = 0;
  let routeCallCountB = 0;

  const clientA = makeMockAiClient({
    route: async () => {
      routeCallCountA++;
      return '{"tool":"none","arguments":{},"reasoning":"test","confidence":0}';
    },
  });
  const clientB = makeMockAiClient({
    route: async () => {
      routeCallCountB++;
      return '{"tool":"none","arguments":{},"reasoning":"test","confidence":0}';
    },
  });

  const decideA = createDecideConversationAction({ aiClient: clientA });
  const decideB = createDecideConversationAction({ aiClient: clientB });

  await decideA({
    content: "hi",
    messages: [],
    memoryContext: null,
    tools: [makeTool()],
    replyModel: "m",
  });
  await decideB({
    content: "hi",
    messages: [],
    memoryContext: null,
    tools: [makeTool()],
    replyModel: "m",
  });

  assert.equal(routeCallCountA, 1);
  assert.equal(routeCallCountB, 1);
});
