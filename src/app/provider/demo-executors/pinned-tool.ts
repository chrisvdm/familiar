const noteStore = new Map<string, Array<{ id: string; execution_id: string; text: string; created_at: string }>>();
const ideaStore = new Map<string, Array<{ id: string; execution_id: string; text: string; created_at: string }>>();

const getStoreForTool = (toolName: string) =>
  toolName === "notes.capture" ? noteStore : ideaStore;

const getLabelForTool = (toolName: string) =>
  toolName === "notes.capture" ? "note" : "idea";

const getEntries = (toolName: string, userId: string) => [
  ...(getStoreForTool(toolName).get(userId) ?? []),
];

const appendEntry = ({
  toolName,
  userId,
  content,
  executionId,
}: {
  toolName: string;
  userId: string;
  content: string;
  executionId: string;
}) => {
  const store = getStoreForTool(toolName);
  const current = getEntries(toolName, userId);
  const entry = {
    id: crypto.randomUUID(),
    execution_id: executionId,
    text: content,
    created_at: new Date().toISOString(),
  };
  store.set(userId, [...current, entry]);
  return entry;
};

const normalizeMessage = (payload: Record<string, unknown>) => {
  const args = payload.arguments as Record<string, unknown> | undefined;
  const context = payload.context as Record<string, unknown> | undefined;
  const explicit = typeof args?.message === "string" ? args.message.trim() : "";
  const rawInput = typeof context?.raw_input_text === "string" ? context.raw_input_text.trim() : "";
  return explicit || rawInput;
};

export const getToolEntriesForUser = ({
  toolName,
  userId,
}: {
  toolName: string;
  userId: string;
}) => getEntries(toolName, userId);

export const executeToolCall = ({
  payload,
  defaultUserId = "demo_user",
}: {
  payload: Record<string, unknown>;
  defaultUserId?: string;
}) => {
  const toolName = String(payload.tool_name || "").trim();

  if (toolName !== "notes.capture" && toolName !== "ideas.capture") {
    return {
      ok: false,
      state: "failed" as const,
      error: {
        code: "unknown_tool",
        message: `Unknown tool: ${toolName || "missing"}.`,
      },
    };
  }

  const message = normalizeMessage(payload);

  if (!message) {
    return {
      ok: true,
      state: "needs_clarification" as const,
      result: {
        summary: `What should I capture in ${getLabelForTool(toolName)}s?`,
      },
    };
  }

  const userId = String(payload.user_id || defaultUserId).trim();
  const executionId = String(payload.execution_id || "").trim();
  const entry = appendEntry({ toolName, userId, content: message, executionId });
  const label = getLabelForTool(toolName);

  return {
    ok: true,
    state: "completed" as const,
    result: {
      summary: `Captured ${label}: ${message}`,
      data: { entry, entries: getEntries(toolName, userId) },
    },
  };
};
