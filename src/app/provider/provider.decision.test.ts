import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIdentityResponse,
  createDecideConversationAction,
  isIdentityQuestion,
} from "./provider.decision.ts";
import type { AllowedTool } from "./provider.types.ts";

const createMockAiClient = () => ({
  route: async () => '{"tool":"none","arguments":{},"reasoning":"mock","follow_up":null,"confidence":0.0}',
  extract: async () => "{}",
  reply: async () => "mock reply",
  replyStream: async function* () { yield "mock"; },
});

const createTool = (overrides: Partial<AllowedTool> & { toolName: string; description: string }): AllowedTool => ({
  toolName: overrides.toolName,
  description: overrides.description,
  inputSchema: overrides.inputSchema ?? { type: "object" },
  inputMode: overrides.inputMode ?? "processed",
  policy: overrides.policy ?? {},
  status: overrides.status ?? "active",
  ...(overrides.executorPayload !== undefined ? { executorPayload: overrides.executorPayload } : {}),
});

test("isIdentityQuestion detects identity intents", () => {
  assert.ok(isIdentityQuestion("who are you"));
  assert.ok(isIdentityQuestion("What are you?"));
  assert.ok(isIdentityQuestion("what can you do"));
  assert.ok(isIdentityQuestion("what tools are available"));
  assert.ok(isIdentityQuestion("what tools do you have"));
  assert.ok(isIdentityQuestion("hey, who are you and what can you do?"));
});

test("isIdentityQuestion rejects normal inputs", () => {
  assert.ok(!isIdentityQuestion("add a todo"));
  assert.ok(!isIdentityQuestion("what is the weather"));
  assert.ok(!isIdentityQuestion("who is the president"));
});

test("buildIdentityResponse lists active tools", () => {
  const tools: AllowedTool[] = [
    createTool({ toolName: "echo", description: "Echoes input back." }),
    createTool({ toolName: "hidden", description: "Disabled tool.", status: "disabled" }),
  ];

  const response = buildIdentityResponse(tools);
  assert.ok(response.startsWith("I am a tool routing tool. Here are the available tools:"));
  assert.ok(response.includes("- echo: Echoes input back."));
  assert.ok(!response.includes("hidden"));
});

test("buildIdentityResponse handles no active tools", () => {
  const tools: AllowedTool[] = [
    createTool({ toolName: "hidden", description: "Disabled tool.", status: "disabled" }),
  ];

  const response = buildIdentityResponse(tools);
  assert.equal(response, "I am a tool routing tool. There are no available tools right now.");
});

test("createDecideConversationAction returns identity response without calling AI", async () => {
  let routeCalled = false;
  const aiClient = {
    ...createMockAiClient(),
    route: async () => {
      routeCalled = true;
      return '{"tool":"none","arguments":{},"reasoning":"mock","follow_up":null,"confidence":0.0}';
    },
  };

  const decide = createDecideConversationAction({ aiClient });
  const result = await decide({
    content: "who are you",
    messages: [],
    memoryContext: null,
    tools: [createTool({ toolName: "echo", description: "Echoes input back." })],
    replyModel: "openai/gpt-4o-mini",
  });

  assert.equal(result.action, "direct_reply");
  assert.ok((result as { reply: string }).reply.includes("I am a tool routing tool."));
  assert.ok((result as { reply: string }).reply.includes("- echo: Echoes input back."));
  assert.ok(!routeCalled, "AI route should not be called for identity questions");
});
