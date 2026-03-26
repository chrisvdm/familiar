import { createEmptyGlobalMemory, type GlobalMemory } from "../chat/shared.ts";

import type {
  AllowedTool,
  MemoryPolicy,
  ProviderExecutionState,
} from "./provider.types";

export const CONVERSATION_RATE_LIMIT_WINDOW_MS = 60_000;
export const CONVERSATION_RATE_LIMIT_MAX_REQUESTS = 30;
export const TOOLS_SYNC_RATE_LIMIT_WINDOW_MS = 60_000;
export const TOOLS_SYNC_RATE_LIMIT_MAX_REQUESTS = 10;
export const TOOL_CONFIRMATION_MIN_CONFIDENCE = 0.6;
export const TOOL_CONFIRMATION_MAX_CONFIDENCE = 0.75;

export const clampDecisionConfidence = (
  value: unknown,
  fallback = 1,
) => {
  const numericValue =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  if (numericValue < 0) {
    return 0;
  }

  if (numericValue > 1) {
    return 1;
  }

  return numericValue;
};

export const getToolDecisionConfidenceAction = (confidence: number) => {
  if (confidence < TOOL_CONFIRMATION_MIN_CONFIDENCE) {
    return "clarify" as const;
  }

  if (confidence <= TOOL_CONFIRMATION_MAX_CONFIDENCE) {
    return "confirm" as const;
  }

  return "execute" as const;
};

const CONFIRM_WORDS = [
  "yes",
  "yeah",
  "yep",
  "yup",
  "correct",
  "that is right",
  "that's right",
  "thats right",
  "please do",
  "go ahead",
  "do it",
  "okay",
  "ok",
  "sure",
];

const REJECT_WORDS = [
  "no",
  "nope",
  "nah",
  "wrong",
  "don't",
  "dont",
  "do not",
  "not that",
  "not quite",
  "stop",
  "cancel",
];

export const interpretPendingToolConfirmation = (input: string) => {
  const normalized = input.trim().toLowerCase();

  if (!normalized) {
    return "unknown" as const;
  }

  if (CONFIRM_WORDS.some((phrase) => normalized === phrase || normalized.startsWith(`${phrase} `))) {
    return "confirm" as const;
  }

  if (REJECT_WORDS.some((phrase) => normalized === phrase || normalized.startsWith(`${phrase} `))) {
    return "reject" as const;
  }

  return "unknown" as const;
};

export const extractPendingToolConfirmationRemainder = (input: string) => {
  const trimmed = input.trim();
  const normalized = trimmed.toLowerCase();

  for (const phrase of CONFIRM_WORDS) {
    if (normalized === phrase) {
      return "";
    }

    if (
      normalized.startsWith(`${phrase} `) ||
      normalized.startsWith(`${phrase},`) ||
      normalized.startsWith(`${phrase}.`) ||
      normalized.startsWith(`${phrase}!`)
    ) {
      const remainder = trimmed.slice(phrase.length).trim();

      return remainder
        .replace(/^[\s,!.:-]+/, "")
        .replace(
          /^(?:thanks|thank you|please|pls|ok|okay|sure)\b[\s,!.:-]*/i,
          "",
        )
        .trim();
    }
  }

  return "";
};

export const extractToolStringValue = ({
  content,
  fieldName,
}: {
  content: string;
  fieldName: string;
}) => {
  const trimmed = content.trim();
  const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `^(?:please\\s+)?(?:add|save|store|remember|note(?:\\s+down)?|write(?:\\s+down)?)\\s+(.+?)\\s+(?:to|in|into)\\s+(?:the\\s+)?${escapedFieldName}$`,
      "i",
    ),
    new RegExp(
      `^(?:please\\s+)?(?:add|save|store|remember|note(?:\\s+down)?|write(?:\\s+down)?)\\s+(?:this\\s+)?${escapedFieldName}\\s*[:,-]?\\s*(.+)$`,
      "i",
    ),
    new RegExp(`^(?:please\\s+)?${escapedFieldName}\\s*[:,-]?\\s*(.+)$`, "i"),
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const candidate = match?.[1]?.trim();

    if (candidate) {
      return candidate;
    }
  }

  return null;
};

const TOOL_SHORTCUT_PATTERN =
  /(?:^|\s)@(?:\[(.+?)\]|([A-Za-z0-9._-]+))(?=\s|$)/g;
const TOOL_SHORTCUT_EXIT_PATTERN =
  /^that'?s (?:all(?: for)?|enough(?: for)?)\s+(@(?:\[(.+?)\]|([A-Za-z0-9._-]+))|(.+))$/i;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const stripInlineToolExitPhrase = ({
  content,
  toolName,
}: {
  content: string;
  toolName: string;
}) => {
  const escapedToolName = escapeRegex(toolName.trim());
  const inlineExitPattern = new RegExp(
    String.raw`\bthat'?s\s+(?:all(?:\s+for)?|enough(?:\s+for)?)\s+(?:@\[${escapedToolName}\]|@${escapedToolName}|${escapedToolName})\b`,
    "i",
  );
  const match = content.match(inlineExitPattern);

  const explicitEndPattern = /(?:^|\s)(@@|@end)(?=\s|$)/i;
  const explicitEndMatch = content.match(explicitEndPattern);
  const explicitEndIndex =
    explicitEndMatch && typeof explicitEndMatch.index === "number"
      ? explicitEndMatch.index
      : null;
  const inlineExitIndex = match && typeof match.index === "number" ? match.index : null;

  if (explicitEndIndex === null && inlineExitIndex === null) {
    return content.trim();
  }

  const cutoffIndex =
    explicitEndIndex === null
      ? inlineExitIndex
      : inlineExitIndex === null
        ? explicitEndIndex
        : Math.min(explicitEndIndex, inlineExitIndex);

  return content.slice(0, cutoffIndex ?? undefined).trim();
};

export const parseToolShortcutInvocations = ({
  content,
  tools,
}: {
  content: string;
  tools: AllowedTool[];
}) => {
  const trimmed = content.trimStart();
  const rawMatches = [...trimmed.matchAll(TOOL_SHORTCUT_PATTERN)];

  if (rawMatches.length === 0) {
    return [];
  }

  const matches = rawMatches
    .map((match) => {
      const requestedToolName = (match[1] || match[2] || "").trim();

      if (!requestedToolName) {
        return null;
      }

      const tool = tools.find(
        (entry) =>
          entry.status === "active" &&
          entry.toolName.toLowerCase() === requestedToolName.toLowerCase(),
      );

      if (!tool) {
        return null;
      }

      return {
        match,
        tool,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        match: RegExpExecArray;
        tool: AllowedTool;
      } => entry !== null,
    );

  if (matches.length === 0) {
    return [];
  }

  const invocations = [];

  for (const [index, entry] of matches.entries()) {
    const { match, tool } = entry;
    const requestedToolName = (match[1] || match[2] || "").trim();

    if (!requestedToolName) {
      continue;
    }

    const matchStart = match.index ?? -1;
    const matchLength = match[0]?.length ?? 0;

    if (matchStart < 0 || matchLength === 0) {
      continue;
    }

    const contentStart = matchStart + matchLength;
    const nextStart =
      index + 1 < matches.length
        ? (matches[index + 1]?.match.index ?? trimmed.length)
        : trimmed.length;
    const remainder = stripInlineToolExitPhrase({
      content: trimmed.slice(contentStart, nextStart),
      toolName: tool.toolName,
    });

    invocations.push({
      tool,
      remainder,
    });
  }

  return invocations;
};

export const getToolInputMode = (tool: {
  inputMode?: "processed" | "raw";
}) => tool.inputMode ?? "processed";

export const getRawToolStringFieldName = (tool: {
  inputSchema?: Record<string, unknown>;
}) => {
  const properties =
    tool.inputSchema &&
    typeof tool.inputSchema === "object" &&
    tool.inputSchema.properties &&
    typeof tool.inputSchema.properties === "object"
      ? (tool.inputSchema.properties as Record<string, unknown>)
      : {};

  const stringFields = Object.entries(properties)
    .filter(([, value]) => {
      if (!value || typeof value !== "object") {
        return false;
      }

      return (value as { type?: unknown }).type === "string";
    })
    .map(([fieldName]) => fieldName);

  return stringFields.length === 1 ? stringFields[0] : null;
};

export const validateToolInputMode = (tool: {
  toolName: string;
  inputMode?: "processed" | "raw";
  inputSchema?: Record<string, unknown>;
}) => {
  const inputMode = getToolInputMode(tool);

  if (inputMode !== "raw") {
    return;
  }

  if (!getRawToolStringFieldName(tool)) {
    throw new Error(
      `Tool ${tool.toolName} uses input_mode raw but does not define exactly one string field in input_schema.`,
    );
  }
};

export const parseToolShortcutInvocation = ({
  content,
  tools,
}: {
  content: string;
  tools: AllowedTool[];
}) => {
  return parseToolShortcutInvocations({ content, tools })[0] ?? null;
};

export const isToolShortcutExitInput = ({
  content,
  toolName,
}: {
  content: string;
  toolName: string;
}) => {
  const trimmed = content.trim();
  const match = trimmed.match(TOOL_SHORTCUT_EXIT_PATTERN);

  if (!match) {
    return false;
  }

  const requestedToolName = (match[2] || match[3] || match[4] || "")
    .trim()
    .toLowerCase();

  return Boolean(requestedToolName) && requestedToolName === toolName.trim().toLowerCase();
};

const getToolSchemaProperties = (tool: AllowedTool) => {
  const properties = tool.inputSchema?.properties;

  if (!properties || typeof properties !== "object") {
    return {};
  }

  return properties as Record<string, unknown>;
};

export const buildShortcutToolArguments = ({
  tool,
  content,
}: {
  tool: AllowedTool;
  content: string;
}) => {
  if (getToolInputMode(tool) === "raw") {
    const rawFieldName = getRawToolStringFieldName(tool);

    if (!rawFieldName) {
      return {};
    }

    return {
      [rawFieldName]: content,
    };
  }

  const properties = getToolSchemaProperties(tool);
  const propertyEntries = Object.entries(properties).filter(([, value]) =>
    Boolean(value && typeof value === "object"),
  );
  const preferredStringFields = ["text", "input", "message", "content", "prompt"];
  const preferredArrayFields = ["texts", "messages", "lines", "todo_items"];

  const stringField = preferredStringFields.find((fieldName) => {
    const property = properties[fieldName] as { type?: unknown } | undefined;
    return property?.type === "string";
  });

  if (stringField) {
    return {
      [stringField]: content,
    };
  }

  const singleStringField = propertyEntries.find(([, value]) => {
    const property = value as { type?: unknown };
    return property.type === "string";
  });

  if (singleStringField && propertyEntries.length === 1) {
    return {
      [singleStringField[0]]: content,
    };
  }

  const arrayField = preferredArrayFields.find((fieldName) => {
    const property = properties[fieldName] as
      | { type?: unknown; items?: { type?: unknown } }
      | undefined;
    return property?.type === "array" && property.items?.type === "string";
  });

  if (arrayField) {
    return {
      [arrayField]: [content],
    };
  }

  const singleStringArrayField = propertyEntries.find(([, value]) => {
    const property = value as { type?: unknown; items?: { type?: unknown } };
    return property.type === "array" && property.items?.type === "string";
  });

  if (singleStringArrayField && propertyEntries.length === 1) {
    return {
      [singleStringArrayField[0]]: [content],
    };
  }

  return {};
};

const TODO_ITEM_VERB_PATTERN =
  /^(call|email|buy|send|pay|book|schedule|cancel|renew|reply|write|pick up|pickup|drop off|follow up|text|message|plan|order|get|wash|clean|groom|feed|walk|take|make|finish|submit|check|review|prepare)\b/i;

export const splitTodoItemsFromText = (value: string) => {
  const normalized = value
    .replace(/\b(?:to do|todo)\s+list\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return [];
  }

  const parts = normalized
    .split(/\s*(?:,|;|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (
    parts.length > 1 &&
    parts.every((part) => TODO_ITEM_VERB_PATTERN.test(part))
  ) {
    return parts;
  }

  return [normalized];
};

export const getRequiredToolArgumentFields = (
  inputSchema: Record<string, unknown> | undefined,
) => {
  if (!inputSchema || typeof inputSchema !== "object") {
    return [];
  }

  const required = (inputSchema as { required?: unknown }).required;

  if (!Array.isArray(required)) {
    return [];
  }

  return required.filter((field): field is string => typeof field === "string");
};

export const hasMeaningfulToolArgumentValue = (value: unknown): boolean => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return Boolean(
      normalized &&
        normalized !== "null" &&
        normalized !== "undefined",
    );
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasMeaningfulToolArgumentValue(item));
  }

  if (value && typeof value === "object") {
    return Object.values(value).some((entry) => hasMeaningfulToolArgumentValue(entry));
  }

  return value !== null && value !== undefined;
};

export const getMissingRequiredToolArgumentFields = ({
  inputSchema,
  args,
}: {
  inputSchema: Record<string, unknown> | undefined;
  args: Record<string, unknown>;
}) =>
  getRequiredToolArgumentFields(inputSchema).filter(
    (field) => !hasMeaningfulToolArgumentValue(args[field]),
  );

export const selectProviderGlobalMemory = ({
  memoryPolicy,
  globalMemory,
  isPrivate,
}: {
  memoryPolicy: MemoryPolicy;
  globalMemory: GlobalMemory;
  isPrivate: boolean;
}) => {
  if (isPrivate) {
    return createEmptyGlobalMemory();
  }

  if (memoryPolicy.mode === "provider_user" || memoryPolicy.mode === "custom_scope") {
    return globalMemory;
  }

  return createEmptyGlobalMemory();
};

export const applyConversationRateLimit = ({
  timestamps,
  now = Date.now(),
  maxRequests = CONVERSATION_RATE_LIMIT_MAX_REQUESTS,
  windowMs = CONVERSATION_RATE_LIMIT_WINDOW_MS,
}: {
  timestamps: string[];
  now?: number;
  maxRequests?: number;
  windowMs?: number;
}) => {
  const cutoff = now - windowMs;
  const validTimestamps = timestamps.filter((value) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed >= cutoff;
  });

  if (validTimestamps.length >= maxRequests) {
    const oldestTimestamp = Date.parse(validTimestamps[0] ?? "");
    const retryAfterMs = Number.isFinite(oldestTimestamp)
      ? Math.max(windowMs - (now - oldestTimestamp), 1_000)
      : windowMs;

    return {
      allowed: false as const,
      timestamps: validTimestamps,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1_000),
    };
  }

  return {
    allowed: true as const,
    timestamps: [...validTimestamps, new Date(now).toISOString()],
  };
};

export const determineMockExecutionState = ({
  toolName,
  args,
}: {
  toolName: string;
  args: Record<string, unknown>;
}): ProviderExecutionState => {
  const requestedState =
    typeof args.mock_state === "string" ? args.mock_state : null;

  if (
    requestedState === "accepted" ||
    requestedState === "in_progress" ||
    requestedState === "needs_clarification" ||
    requestedState === "failed" ||
    requestedState === "completed"
  ) {
    return requestedState;
  }

  if (toolName === "spreadsheet.update_row") {
    const sheet = args.sheet;
    const rowId = args.row_id;
    const values = args.values;

    if (
      typeof sheet !== "string" ||
      !sheet.trim() ||
      typeof rowId !== "string" ||
      !rowId.trim() ||
      !values ||
      typeof values !== "object"
    ) {
      return "needs_clarification";
    }
  }

  return "completed";
};
