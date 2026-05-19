export const minimalExecutorTools: Array<{
  tool_name: string;
  description: string;
  input_schema: Record<string, unknown>;
  status: "active";
}> = [
  {
    tool_name: "todos.add",
    description:
      "Add one or more items to the user's visible todo list. Use this only when the user clearly asks to add, capture, or remember tasks. The todo_items field should contain only the task text values themselves.",
    input_schema: {
      type: "object",
      properties: {
        todo_items: {
          type: "array",
          description:
            "The exact todo items to add, for example ['buy dog food', 'email the landlord'].",
          items: { type: "string" },
          minItems: 1,
        },
      },
      required: ["todo_items"],
    },
    status: "active",
  },
];

export const asyncCountdownTools: Array<{
  tool_name: string;
  description: string;
  input_schema: Record<string, unknown>;
  status: "active";
}> = [
  {
    tool_name: "countdown.start",
    description:
      "Start a 10 second countdown timer and notify the user when it finishes. Use this when the user asks to start, launch, or run a countdown or timer.",
    input_schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Optional completion message to send when the countdown finishes.",
        },
      },
    },
    status: "active",
  },
];

export const pinnedToolTools: Array<{
  tool_name: string;
  description: string;
  input_mode: "raw";
  input_schema: Record<string, unknown>;
  status: "active";
}> = [
  {
    tool_name: "notes.capture",
    description:
      "Capture verbatim text into the shared notes stream. Use this when the user wants to dictate notes or capture a long block of text.",
    input_mode: "raw",
    input_schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The exact text to capture as a note.",
        },
      },
      required: ["message"],
    },
    status: "active",
  },
  {
    tool_name: "ideas.capture",
    description:
      "Capture verbatim text into the ideas stream. Use this when the user wants to dictate ideas or brainstorm fragments.",
    input_mode: "raw",
    input_schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The exact text to capture as an idea.",
        },
      },
      required: ["message"],
    },
    status: "active",
  },
];
