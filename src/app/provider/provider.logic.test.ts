import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyGlobalMemory,
  createEmptyThreadMemory,
} from "../chat/shared.ts";

import {
  applyConversationRateLimit,
  buildShortcutRawInputText,
  buildShortcutToolArguments,
  buildPersonalMemoryReply,
  clampDecisionConfidence,
  determineMockExecutionState,
  extractPendingToolConfirmationRemainder,
  extractToolStringValue,
  getRawToolStringFieldName,
  getToolInputMode,
  getMissingRequiredToolArgumentFields,
  getToolDecisionConfidenceAction,
  hasMeaningfulToolArgumentValue,
  hasExplicitToolUseIntent,
  interpretPendingToolConfirmation,
  isToolShortcutExitInput,
  parseToolShortcutInvocation,
  parseToolShortcutInvocations,
  sanitizeRawToolInput,
  selectProviderGlobalMemory,
  splitTodoItemsFromText,
  validateToolInputMode,
} from "./provider.logic.ts";

test("private threads do not expose shared global memory", () => {
  const globalMemory = createEmptyGlobalMemory();
  globalMemory.identity.name = [
    {
      key: "name",
      value: "Chris",
      confidence: 0.99,
      updatedAt: "2026-03-19T10:00:00.000Z",
    },
  ];

  const result = selectProviderGlobalMemory({
    memoryPolicy: { mode: "provider_user" },
    globalMemory,
    isPrivate: true,
  });

  assert.deepEqual(result.identity, {});
});

test("provider-user retrieval can use shared global memory", () => {
  const globalMemory = createEmptyGlobalMemory();
  globalMemory.identity.name = [
    {
      key: "name",
      value: "Chris",
      confidence: 0.99,
      updatedAt: "2026-03-19T10:00:00.000Z",
    },
  ];

  const result = selectProviderGlobalMemory({
    memoryPolicy: { mode: "provider_user" },
    globalMemory,
    isPrivate: false,
  });

  assert.equal(result.identity.name?.[0]?.value, "Chris");
});

test("personal memory replies return stored name directly", () => {
  const globalMemory = createEmptyGlobalMemory();
  const threadMemory = createEmptyThreadMemory();
  globalMemory.identity.name = [
    {
      key: "name",
      value: "Chris",
      confidence: 0.99,
      updatedAt: "2026-03-31T10:00:00.000Z",
    },
  ];

  const reply = buildPersonalMemoryReply({
    content: "Do you know my name?",
    threadMemory,
    globalMemory,
  });

  assert.equal(reply, "You go by Chris.");
});

test("personal memory replies treat bare my name prompts as recall", () => {
  const globalMemory = createEmptyGlobalMemory();
  const threadMemory = createEmptyThreadMemory();
  globalMemory.identity.name = [
    {
      key: "name",
      value: "Chris",
      confidence: 0.99,
      updatedAt: "2026-03-31T10:00:00.000Z",
    },
  ];

  const reply = buildPersonalMemoryReply({
    content: "my name",
    threadMemory,
    globalMemory,
  });

  assert.equal(reply, "You go by Chris.");
});

test("personal memory replies summarize stored facts for broad self queries", () => {
  const globalMemory = createEmptyGlobalMemory();
  const threadMemory = createEmptyThreadMemory();
  globalMemory.identity.name = [
    {
      key: "name",
      value: "Chris",
      confidence: 0.99,
      updatedAt: "2026-03-31T10:00:00.000Z",
    },
  ];
  globalMemory.work.profession = [
    {
      key: "profession",
      value: "Engineer",
      confidence: 0.9,
      updatedAt: "2026-03-31T09:59:00.000Z",
    },
  ];

  const reply = buildPersonalMemoryReply({
    content: "What do you know about me?",
    threadMemory,
    globalMemory,
  });

  assert.match(reply ?? "", /I know that/);
  assert.match(reply ?? "", /you go by Chris/);
  assert.match(reply ?? "", /you work as an Engineer/);
});

test("personal memory replies handle follow-up recall prompts from recent context", () => {
  const globalMemory = createEmptyGlobalMemory();
  const threadMemory = createEmptyThreadMemory();
  globalMemory.identity.name = [
    {
      key: "name",
      value: "Chris",
      confidence: 0.99,
      updatedAt: "2026-03-31T10:00:00.000Z",
    },
  ];
  globalMemory.family.partner_name = [
    {
      key: "partner_name",
      value: "Sam",
      confidence: 0.9,
      updatedAt: "2026-03-31T09:59:00.000Z",
    },
  ];

  const reply = buildPersonalMemoryReply({
    content: "anything you have stored",
    messages: [
      {
        id: "msg_user_1",
        role: "user",
        content: "what can you tell me about myself?",
        createdAt: "2026-03-31T10:01:00.000Z",
      },
      {
        id: "msg_assistant_1",
        role: "assistant",
        content: "I know that you go by Chris.",
        createdAt: "2026-03-31T10:01:01.000Z",
      },
    ],
    threadMemory,
    globalMemory,
  });

  assert.match(reply ?? "", /you go by Chris/);
  assert.match(reply ?? "", /partner name is Sam/);
});

test("personal detail follow-ups prefer human facts over work facts", () => {
  const globalMemory = createEmptyGlobalMemory();
  const threadMemory = createEmptyThreadMemory();
  globalMemory.identity.name = [
    {
      key: "name",
      value: "Chris",
      confidence: 0.99,
      updatedAt: "2026-03-31T10:00:00.000Z",
    },
  ];
  globalMemory.preferences.interests = [
    {
      key: "interests",
      value: "dogs",
      confidence: 0.88,
      updatedAt: "2026-03-31T09:58:00.000Z",
    },
  ];
  globalMemory.work.profession = [
    {
      key: "profession",
      value: "Engineer",
      confidence: 0.9,
      updatedAt: "2026-03-31T09:59:00.000Z",
    },
  ];

  const reply = buildPersonalMemoryReply({
    content: "personal details, but really tell me as much as possible",
    messages: [
      {
        id: "msg_user_1",
        role: "user",
        content: "what can you tell me about myself?",
        createdAt: "2026-03-31T10:01:00.000Z",
      },
      {
        id: "msg_assistant_1",
        role: "assistant",
        content: "I know that you go by Chris and you work as an Engineer.",
        createdAt: "2026-03-31T10:01:01.000Z",
      },
    ],
    threadMemory,
    globalMemory,
  });

  assert.match(reply ?? "", /you go by Chris/);
  assert.match(reply ?? "", /you like dogs/);
  assert.doesNotMatch(reply ?? "", /Engineer/);
});

test("personal memory replies admit when no stored name exists", () => {
  const globalMemory = createEmptyGlobalMemory();
  const threadMemory = createEmptyThreadMemory();

  const reply = buildPersonalMemoryReply({
    content: "What is my name?",
    threadMemory,
    globalMemory,
  });

  assert.equal(reply, "I do not know your name yet.");
});

test("rate limiter allows requests under the rolling limit", () => {
  const now = Date.parse("2026-03-19T10:00:30.000Z");
  const timestamps = [
    "2026-03-19T10:00:00.000Z",
    "2026-03-19T10:00:10.000Z",
  ];

  const result = applyConversationRateLimit({
    timestamps,
    now,
    maxRequests: 3,
    windowMs: 60_000,
  });

  assert.equal(result.allowed, true);
  if (result.allowed) {
    assert.equal(result.timestamps.length, 3);
  }
});

test("rate limiter blocks requests over the rolling limit", () => {
  const now = Date.parse("2026-03-19T10:00:30.000Z");
  const timestamps = [
    "2026-03-19T10:00:00.000Z",
    "2026-03-19T10:00:10.000Z",
    "2026-03-19T10:00:20.000Z",
  ];

  const result = applyConversationRateLimit({
    timestamps,
    now,
    maxRequests: 3,
    windowMs: 60_000,
  });

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.retryAfterSeconds, 30);
  }
});

test("mock execution requests clarification when spreadsheet arguments are incomplete", () => {
  const result = determineMockExecutionState({
    toolName: "spreadsheet.update_row",
    args: {
      sheet: "Sales",
    },
  });

  assert.equal(result, "needs_clarification");
});

test("mock execution respects explicit requested states", () => {
  const result = determineMockExecutionState({
    toolName: "spreadsheet.update_row",
    args: {
      mock_state: "accepted",
    },
  });

  assert.equal(result, "accepted");
});

test("mock execution completes when spreadsheet arguments are present", () => {
  const result = determineMockExecutionState({
    toolName: "spreadsheet.update_row",
    args: {
      sheet: "Sales",
      row_id: "42",
      values: {
        status: "contacted",
      },
    },
  });

  assert.equal(result, "completed");
});

test("tool confidence below the confirmation band asks for clarification", () => {
  assert.equal(getToolDecisionConfidenceAction(0.59), "clarify");
});

test("tool confidence inside the confirmation band asks for confirmation", () => {
  assert.equal(getToolDecisionConfidenceAction(0.6), "confirm");
  assert.equal(getToolDecisionConfidenceAction(0.75), "confirm");
});

test("tool confidence above the confirmation band executes immediately", () => {
  assert.equal(getToolDecisionConfidenceAction(0.76), "execute");
});

test("decision confidence is clamped into the valid range", () => {
  assert.equal(clampDecisionConfidence(-1), 0);
  assert.equal(clampDecisionConfidence(2), 1);
  assert.equal(clampDecisionConfidence("bad", 0.9), 0.9);
});

test("pending tool confirmation recognizes yes-like replies", () => {
  assert.equal(interpretPendingToolConfirmation("yes"), "confirm");
  assert.equal(interpretPendingToolConfirmation("go ahead"), "confirm");
});

test("pending tool confirmation can keep extra text after confirmation", () => {
  assert.equal(
    extractPendingToolConfirmationRemainder(
      "yes thanks. I also need to buy him a birthday present",
    ),
    "I also need to buy him a birthday present",
  );
});

test("pending tool confirmation recognizes no-like replies", () => {
  assert.equal(interpretPendingToolConfirmation("no"), "reject");
  assert.equal(interpretPendingToolConfirmation("don't do that"), "reject");
});

test("pending tool confirmation leaves other replies unresolved", () => {
  assert.equal(
    interpretPendingToolConfirmation("tell me more about that"),
    "unknown",
  );
});

test("tool string extraction strips add-to-note phrasing", () => {
  assert.equal(
    extractToolStringValue({
      content: "add wash hair to note",
      fieldName: "note",
    }),
    "wash hair",
  );
});

test("tool string extraction strips save-note phrasing", () => {
  assert.equal(
    extractToolStringValue({
      content: "save this note: buy dog food",
      fieldName: "note",
    }),
    "buy dog food",
  );
});

test("tool shortcut invocation resolves an active tool and keeps the raw remainder", () => {
  const result = parseToolShortcutInvocation({
    content: "@todos.add buy milk and eggs",
    tools: [
      {
        toolName: "todos.add",
        description: "Add todo items",
        inputSchema: {
          type: "object",
          properties: {
            todo_items: {
              type: "array",
              items: {
                type: "string",
              },
            },
          },
        },
        policy: {},
        status: "active",
      },
    ],
  });

  assert.equal(result?.tool.toolName, "todos.add");
  assert.equal(result?.remainder, "buy milk and eggs");
});

test("explicit tool intent requires both a request and a tool reference", () => {
  const result = hasExplicitToolUseIntent({
    content: "send this to discord",
    tools: [
      {
        toolName: "discord",
        description: "Send a Discord message",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
          },
        },
        policy: {},
        status: "active",
      },
    ],
  });

  assert.equal(result, true);
});

test("ordinary chat does not count as explicit tool intent", () => {
  const result = hasExplicitToolUseIntent({
    content: "hello there",
    tools: [
      {
        toolName: "discord",
        description: "Send a Discord message",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
          },
        },
        policy: {},
        status: "active",
      },
    ],
  });

  assert.equal(result, false);
});

test("tool mentions without a request do not count as explicit tool intent", () => {
  const result = hasExplicitToolUseIntent({
    content: "discord is where I hang out",
    tools: [
      {
        toolName: "discord",
        description: "Send a Discord message",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
          },
        },
        policy: {},
        status: "active",
      },
    ],
  });

  assert.equal(result, false);
});

test("tool input mode defaults to processed", () => {
  assert.equal(
    getToolInputMode({
      inputMode: undefined,
    }),
    "processed",
  );
});

test("raw input mode requires exactly one string field", () => {
  assert.throws(
    () =>
      validateToolInputMode({
        toolName: "notes.capture",
        inputMode: "raw",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            body: { type: "string" },
          },
        },
      }),
    /input_mode raw/,
  );
});

test("raw input mode resolves the single string field", () => {
  assert.equal(
    getRawToolStringFieldName({
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
      },
    }),
    "message",
  );
});

test("tool shortcut invocation still accepts bracket form for compatibility", () => {
  const result = parseToolShortcutInvocation({
    content: "@[todos.add] buy milk and eggs",
    tools: [
      {
        toolName: "todos.add",
        description: "Add todo items",
        inputSchema: {
          type: "object",
          properties: {
            todo_items: {
              type: "array",
              items: {
                type: "string",
              },
            },
          },
        },
        policy: {},
        status: "active",
      },
    ],
  });

  assert.equal(result?.tool.toolName, "todos.add");
  assert.equal(result?.remainder, "buy milk and eggs");
});

test("tool shortcut invocation can appear after ordinary text and captures only the remainder", () => {
  const result = parseToolShortcutInvocation({
    content: "My name is john @notes.capture I live in a small town",
    tools: [
      {
        toolName: "notes.capture",
        description: "Capture notes",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
          },
        },
        policy: {},
        status: "active",
      },
    ],
  });

  assert.equal(result?.tool.toolName, "notes.capture");
  assert.equal(result?.remainder, "I live in a small town");
});

test("tool shortcut invocations split chained inline mentions into separate tool payloads", () => {
  const result = parseToolShortcutInvocations({
    content:
      "My name is john @notes.capture I live in a small town @ideas.capture i want to build a horse hospital",
    tools: [
      {
        toolName: "notes.capture",
        description: "Capture notes",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
          },
        },
        policy: {},
        status: "active",
      },
      {
        toolName: "ideas.capture",
        description: "Capture ideas",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
          },
        },
        policy: {},
        status: "active",
      },
    ],
  });

  assert.equal(result.length, 2);
  assert.equal(result[0]?.tool.toolName, "notes.capture");
  assert.equal(result[0]?.remainder, "I live in a small town");
  assert.equal(result[1]?.tool.toolName, "ideas.capture");
  assert.equal(result[1]?.remainder, "i want to build a horse hospital");
});

test("tool shortcut invocations stop at inline exit phrases for the current tool", () => {
  const result = parseToolShortcutInvocations({
    content:
      "my name is john @notes.capture i have puppy that's all notes.capture He runs very fast @ideas.capture I need to buy him a obstacle course",
    tools: [
      {
        toolName: "notes.capture",
        description: "Capture notes",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
          },
        },
        policy: {},
        status: "active",
      },
      {
        toolName: "ideas.capture",
        description: "Capture ideas",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
          },
        },
        policy: {},
        status: "active",
      },
    ],
  });

  assert.equal(result.length, 2);
  assert.equal(result[0]?.tool.toolName, "notes.capture");
  assert.equal(result[0]?.remainder, "i have puppy");
  assert.equal(result[1]?.tool.toolName, "ideas.capture");
  assert.equal(result[1]?.remainder, "I need to buy him a obstacle course");
});

test("tool shortcut invocations stop at @@ delimiter", () => {
  const result = parseToolShortcutInvocations({
    content:
      "@notes.capture I live in a small town @@ He runs very fast @ideas.capture I need to buy him a obstacle course",
    tools: [
      {
        toolName: "notes.capture",
        description: "Capture notes",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
          },
        },
        policy: {},
        status: "active",
      },
      {
        toolName: "ideas.capture",
        description: "Capture ideas",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
          },
        },
        policy: {},
        status: "active",
      },
    ],
  });

  assert.equal(result.length, 2);
  assert.equal(result[0]?.remainder, "I live in a small town");
  assert.equal(result[1]?.remainder, "I need to buy him a obstacle course");
});

test("tool shortcut invocations stop at @end delimiter", () => {
  const result = parseToolShortcutInvocations({
    content:
      "@notes.capture I live in a small town @end He runs very fast @ideas.capture I need to buy him a obstacle course",
    tools: [
      {
        toolName: "notes.capture",
        description: "Capture notes",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
          },
        },
        policy: {},
        status: "active",
      },
      {
        toolName: "ideas.capture",
        description: "Capture ideas",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
          },
        },
        policy: {},
        status: "active",
      },
    ],
  });

  assert.equal(result.length, 2);
  assert.equal(result[0]?.remainder, "I live in a small town");
  assert.equal(result[1]?.remainder, "I need to buy him a obstacle course");
});

test("unknown @mentions inside tool content do not break tool segmentation", () => {
  const result = parseToolShortcutInvocations({
    content:
      "@notes.capture Tell @assistant to summarize this @ideas.capture build a horse hospital",
    tools: [
      {
        toolName: "notes.capture",
        description: "Capture notes",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
          },
        },
        policy: {},
        status: "active",
      },
      {
        toolName: "ideas.capture",
        description: "Capture ideas",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
          },
        },
        policy: {},
        status: "active",
      },
    ],
  });

  assert.equal(result.length, 2);
  assert.equal(result[0]?.tool.toolName, "notes.capture");
  assert.equal(result[0]?.remainder, "Tell @assistant to summarize this");
  assert.equal(result[1]?.tool.toolName, "ideas.capture");
  assert.equal(result[1]?.remainder, "build a horse hospital");
});

test("unknown leading @mentions are ignored rather than forcing tool mode", () => {
  const result = parseToolShortcutInvocations({
    content: "@assistant tell me what @notes.capture should remember",
    tools: [
      {
        toolName: "notes.capture",
        description: "Capture notes",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
          },
        },
        policy: {},
        status: "active",
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.tool.toolName, "notes.capture");
  assert.equal(result[0]?.remainder, "should remember");
});

test("tool shortcut exit phrases are recognized", () => {
  assert.equal(
    isToolShortcutExitInput({
      content: "that's all for todos.add",
      toolName: "todos.add",
    }),
    true,
  );
  assert.equal(
    isToolShortcutExitInput({
      content: "that's all for @todos.add",
      toolName: "todos.add",
    }),
    true,
  );
  assert.equal(
    isToolShortcutExitInput({
      content: "that's enough @todos.add",
      toolName: "todos.add",
    }),
    true,
  );
  assert.equal(
    isToolShortcutExitInput({
      content: "that's all todos.add",
      toolName: "todos.add",
    }),
    true,
  );
  assert.equal(
    isToolShortcutExitInput({
      content: "that's all for @[todos.add]",
      toolName: "todos.add",
    }),
    true,
  );
  assert.equal(
    isToolShortcutExitInput({
      content: "that's all for countdown.start",
      toolName: "todos.add",
    }),
    false,
  );
  assert.equal(
    isToolShortcutExitInput({
      content: "keep going",
      toolName: "todos.add",
    }),
    false,
  );
});

test("shortcut arguments preserve a verbatim string for array tools", () => {
  const args = buildShortcutToolArguments({
    tool: {
      toolName: "todos.add",
      description: "Add todo items",
      inputSchema: {
        type: "object",
        properties: {
          todo_items: {
            type: "array",
            items: {
              type: "string",
            },
          },
        },
      },
      policy: {},
      status: "active",
    },
    content: "buy milk and eggs",
  });

  assert.deepEqual(args, {
    todo_items: ["buy milk and eggs"],
  });
});

test("shortcut arguments use the raw string field for raw tools", () => {
  const args = buildShortcutToolArguments({
    tool: {
      toolName: "notes.capture",
      description: "Capture notes",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
          },
        },
      },
      inputMode: "raw",
      executorPayload: undefined,
      policy: {},
      status: "active",
    },
    content: "I live in a small town",
  });

  assert.deepEqual(args, {
    message: "I live in a small town",
  });
});

test("sanitizeRawToolInput removes leading tool shortcut names", () => {
  assert.equal(
    sanitizeRawToolInput({
      toolName: "discord",
      content: "@discord hi my name is familiar",
    }),
    "hi my name is familiar",
  );
});

test("sanitizeRawToolInput removes send-to prefixes", () => {
  assert.equal(
    sanitizeRawToolInput({
      toolName: "discord",
      content: "send to discord: this is a message",
    }),
    "this is a message",
  );
});

test("sanitizeRawToolInput returns empty string for invocation-only content", () => {
  assert.equal(
    sanitizeRawToolInput({
      toolName: "discord",
      content: "send message to discord",
    }),
    "",
  );
});

test("raw shortcut arguments strip explicit invocation prefixes", () => {
  const args = buildShortcutToolArguments({
    tool: {
      toolName: "discord",
      description: "Send a Discord message",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
          },
        },
      },
      inputMode: "raw",
      executorPayload: undefined,
      policy: {},
      status: "active",
    },
    content: "send this to discord: this is from familiar",
  });

  assert.deepEqual(args, {
    message: "this is from familiar",
  });
});

test("processed shortcut arguments strip explicit invocation prefixes", () => {
  const args = buildShortcutToolArguments({
    tool: {
      toolName: "discord",
      description: "Send a Discord message",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
          },
        },
      },
      policy: {},
      status: "active",
    },
    content: "@discord hello",
  });

  assert.deepEqual(args, {
    message: "hello",
  });
});

test("raw shortcut raw input strips explicit invocation prefixes", () => {
  const rawInputText = buildShortcutRawInputText({
    tool: {
      toolName: "discord",
      description: "Send a Discord message",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
          },
        },
      },
      inputMode: "raw",
      executorPayload: undefined,
      policy: {},
      status: "active",
    },
    content: "@discord boo!",
  });

  assert.equal(rawInputText, "boo!");
});

test("todo item splitting produces multiple items for compound task text", () => {
  assert.deepEqual(splitTodoItemsFromText("wash my dog and buy dad a present"), [
    "wash my dog",
    "buy dad a present",
  ]);
});

test("required tool argument detection treats empty strings as missing", () => {
  assert.deepEqual(
    getMissingRequiredToolArgumentFields({
      inputSchema: {
        type: "object",
        required: ["sheet", "row_id"],
      },
      args: {
        sheet: "Sales",
        row_id: "   ",
      },
    }),
    ["row_id"],
  );
});

test("required tool argument detection treats non-empty arrays as present", () => {
  assert.equal(hasMeaningfulToolArgumentValue(["buy milk"]), true);
  assert.equal(hasMeaningfulToolArgumentValue([]), false);
});
