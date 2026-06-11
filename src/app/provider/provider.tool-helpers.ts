import type { AllowedTool } from "./provider.types.ts";
import {
  extractToolStringValue,
  getRawToolStringFieldName,
  getToolInputMode,
  sanitizeRawToolInput,
  splitTodoItemsFromText,
} from "./provider.logic.ts";

export const normalizeToolArguments = ({
  tool,
  args,
  content,
}: {
  tool?: AllowedTool;
  args: Record<string, unknown>;
  content: string;
}) => {
  if (!tool) {
    return args;
  }

  if (getToolInputMode(tool) === "raw") {
    const rawFieldName = getRawToolStringFieldName(tool);

    if (!rawFieldName) {
      return args;
    }

    const currentValue = args[rawFieldName];

    if (typeof currentValue === "string") {
      return {
        [rawFieldName]: sanitizeRawToolInput({
          toolName: tool.toolName,
          content: currentValue,
        }),
      };
    }

    return args;
  }

  const properties = tool.inputSchema?.properties;

  if (!properties || typeof properties !== "object") {
    return args;
  }

  if (tool.toolName === "todos.add") {
    const currentValue = args.todo_items;

    if (Array.isArray(currentValue)) {
      return {
        ...args,
        todo_items: currentValue
          .flatMap((item) =>
            typeof item === "string" ? splitTodoItemsFromText(item) : [],
          )
          .filter(Boolean),
      };
    }

    if (typeof currentValue === "string") {
      return {
        ...args,
        todo_items: splitTodoItemsFromText(currentValue),
      };
    }

    const explicitTodo = extractExplicitTodoCandidate(content);
    const implicitTodo = extractImplicitTodoCandidate(content);
    const fallbackTodo = explicitTodo ?? implicitTodo;

    if (fallbackTodo) {
      return {
        ...args,
        todo_items: splitTodoItemsFromText(fallbackTodo),
      };
    }
  }

  const stringEntries = Object.entries(properties).filter(([, value]) => {
    if (!value || typeof value !== "object") {
      return false;
    }

    return (value as { type?: unknown }).type === "string";
  });

  if (stringEntries.length !== 1) {
    return args;
  }

  const [fieldName] = stringEntries[0];
  const currentValue = args[fieldName];

  if (typeof currentValue !== "string") {
    return args;
  }

  const extractedValue = extractToolStringValue({
    content,
    fieldName,
  });

  if (!extractedValue) {
    return args;
  }

  return {
    ...args,
    [fieldName]: extractedValue,
  };
};

export const normalizeToolExecutionInput = ({
  tool,
  args,
  content,
}: {
  tool?: AllowedTool;
  args: Record<string, unknown>;
  content: string;
}) => {
  const normalizedArguments = normalizeToolArguments({
    tool,
    args,
    content,
  });

  let rawInputText: string | undefined;

  if (tool && getToolInputMode(tool) === "raw") {
    const rawFieldName = getRawToolStringFieldName(tool);

    if (rawFieldName) {
      const rawFieldValue = normalizedArguments[rawFieldName];
      rawInputText = typeof rawFieldValue === "string" ? rawFieldValue : undefined;
    }
  }

  return {
    arguments: normalizedArguments,
    rawInputText,
  };
};

const TODO_LEADING_VERB_PATTERN =
  /^(call|email|buy|send|pay|book|schedule|cancel|renew|reply|write|pick up|pickup|drop off|follow up|text|message|plan|order|get|wash|clean|groom|feed|walk|take|make|finish|submit|check|review|prepare)\b/i;

const looksLikeTodoClause = (value: string) =>
  TODO_LEADING_VERB_PATTERN.test(value.trim());

const extractExplicitTodoCandidate = (content: string) => {
  const trimmed = content.trim();

  if (!trimmed || trimmed.includes("?")) {
    return null;
  }

  const patterns = [
    /^(?:please\s+)?add\s+(.+?)\s+(?:to|into|in)\s+(?:my\s+)?(?:to do|todo)\s+list$/i,
    /^(?:please\s+)?add\s+(.+?)\s+(?:to|into|in)\s+(?:my\s+)?todos?$/i,
    /^(?:please\s+)?(?:remember|remind me)\s+to\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const candidate = match?.[1]?.trim();

    if (candidate) {
      return candidate.replace(/[.?!]+$/, "").trim();
    }
  }

  if (looksLikeTodoClause(trimmed)) {
    return trimmed.replace(/[.?!]+$/, "").trim();
  }

  return null;
};

const extractImplicitTodoCandidate = (content: string) => {
  const trimmed = content.trim();

  if (!trimmed || trimmed.includes("?")) {
    return null;
  }

  const patterns = [
    /^(?:i need to|i have to|i should|i ne[a-z]{1,3} to)\s+(.+)$/i,
    /^(?:remember|remind me)\s+to\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const candidate = match?.[1]?.trim();

    if (candidate) {
      return candidate.replace(/[.?!]+$/, "").trim();
    }
  }

  return null;
};

export const buildToolConfirmationQuestion = ({
  tool,
}: {
  tool?: AllowedTool;
}) => {
  if (tool?.toolName === "todos.add") {
    return "Do you want to add that to your todo list?";
  }

  const toolLabel = tool?.description?.trim()
    ? `${tool.toolName} (${tool.description.trim()})`
    : tool?.toolName || "that tool";

  return `It looks like you want me to use ${toolLabel}. Is that right?`;
};

export const buildLowConfidenceToolQuestion = () =>
  "I am not confident enough to pick the right tool yet. Can you say a bit more about what you want me to do?";

export const buildPendingConfirmationReminder = ({
  tool,
}: {
  tool?: AllowedTool;
}) => {
  const toolLabel = tool?.description?.trim()
    ? `${tool.toolName} (${tool.description.trim()})`
    : tool?.toolName || "that tool";

  return `I was asking whether you wanted me to use ${toolLabel}. Please answer yes or no.`;
};
