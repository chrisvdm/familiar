import { createEmptyGlobalMemory, type GlobalMemory } from "../chat/shared.ts";

import type { AllowedTool, MemoryPolicy, ProviderExecutionState } from "./provider.types.ts";

export const CONVERSATION_RATE_LIMIT_WINDOW_MS = 60_000;
export const CONVERSATION_RATE_LIMIT_MAX_REQUESTS = 30;
export const TOOLS_SYNC_RATE_LIMIT_WINDOW_MS = 60_000;
export const TOOLS_SYNC_RATE_LIMIT_MAX_REQUESTS = 10;
export const TOOL_CONFIRMATION_MIN_CONFIDENCE = 0.6;
export const TOOL_CONFIRMATION_MAX_CONFIDENCE = 0.75;
export const MAX_INPUT_TEXT_BYTES = 500 * 1024; // 500KB
export const MAX_CHUNK_BYTES = 50 * 1024; // 50KB
export const MAX_THREADS_PER_USER = 500;
export const SOFT_THREADS_LIMIT = 450;
export const MAX_MESSAGES_PER_THREAD = 5_000;
export const MAX_TOOLS_PER_SYNC = 500;
export const SOFT_TOOLS_LIMIT = 200;
export const WEB_PROVIDER_ID = "texty_web";

export const normalizeAllowedTools = (
  tools: Array<{
    tool_name: string;
    description: string;
    input_schema: Record<string, unknown>;
    input_mode?: "processed" | "raw";
    executor_payload?: unknown;
    policy?: Record<string, unknown>;
    status?: "active" | "disabled";
    base_url?: string;
  }>,
): AllowedTool[] =>
  tools.map((tool) => {
    validateToolSchema(tool);

    const normalizedTool = {
      toolName: tool.tool_name,
      description: tool.description,
      inputSchema: tool.input_schema,
      inputMode: tool.input_mode ?? "processed",
      executorPayload: tool.executor_payload,
      policy: tool.policy ?? {},
      status: tool.status ?? "active",
    } satisfies AllowedTool;

    validateToolInputMode(normalizedTool);

    return normalizedTool;
  });

export const clampDecisionConfidence = (value: unknown, fallback = 1) => {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : fallback;

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

  if (
    CONFIRM_WORDS.some((phrase) => normalized === phrase || normalized.startsWith(`${phrase} `))
  ) {
    return "confirm" as const;
  }

  if (REJECT_WORDS.some((phrase) => normalized === phrase || normalized.startsWith(`${phrase} `))) {
    return "reject" as const;
  }

  return "unknown" as const;
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

const TOOL_SHORTCUT_PATTERN = /(?:^|\s)@(?:\[(.+?)\]|([A-Za-z0-9._-]+))(?=\s|$)/g;
const TOOL_SHORTCUT_EXIT_PATTERN =
  /^that'?s (?:all(?: for)?|enough(?: for)?)\s+(@(?:\[(.+?)\]|([A-Za-z0-9._-]+))|(.+))$/i;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const sanitizeRawToolInput = ({
  toolName,
  content,
}: {
  toolName: string;
  content: string;
}) => {
  const trimmed = content.trim();

  if (!trimmed) {
    return "";
  }

  const escapedToolName = escapeRegex(toolName.trim());
  const patterns = [
    new RegExp(`^@(?:\\[${escapedToolName}\\]|${escapedToolName})\\s+`, "i"),
    new RegExp(
      `^(?:please\\s+)?send(?:\\s+(?:this|message))?\\s+to\\s+${escapedToolName}\\s*[:,-]?\\s*`,
      "i",
    ),
    new RegExp(`^${escapedToolName}\\s*[:,-]\\s*`, "i"),
  ];

  for (const pattern of patterns) {
    if (pattern.test(trimmed)) {
      return trimmed.replace(pattern, "").trim();
    }
  }

  return trimmed;
};

const sanitizeShortcutInvocationContent = ({
  toolName,
  content,
}: {
  toolName: string;
  content: string;
}) =>
  sanitizeRawToolInput({
    toolName,
    content,
  });

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
    explicitEndMatch && typeof explicitEndMatch.index === "number" ? explicitEndMatch.index : null;
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

export const getToolInputMode = (tool: { inputMode?: "processed" | "raw" }) =>
  tool.inputMode ?? "processed";

export const getRawToolStringFieldName = (tool: { inputSchema?: Record<string, unknown> }) => {
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

export const validateToolSchema = (tool: {
  tool_name?: string;
  description?: string;
  input_schema?: unknown;
  input_mode?: unknown;
  status?: unknown;
}) => {
  if (!tool.tool_name || typeof tool.tool_name !== "string" || !tool.tool_name.trim()) {
    throw new Error("Each tool must have a non-empty tool_name string.");
  }

  if (!tool.description || typeof tool.description !== "string" || !tool.description.trim()) {
    throw new Error(`Tool ${tool.tool_name} must have a non-empty description string.`);
  }

  if (
    !tool.input_schema ||
    typeof tool.input_schema !== "object" ||
    Array.isArray(tool.input_schema)
  ) {
    throw new Error(`Tool ${tool.tool_name} must have a valid input_schema object.`);
  }

  const schema = tool.input_schema as Record<string, unknown>;
  if (schema.type !== "object") {
    throw new Error(`Tool ${tool.tool_name} input_schema must have type "object".`);
  }

  if (
    tool.input_mode !== undefined &&
    tool.input_mode !== "processed" &&
    tool.input_mode !== "raw"
  ) {
    throw new Error(`Tool ${tool.tool_name} input_mode must be "processed" or "raw".`);
  }

  if (tool.status !== undefined && tool.status !== "active" && tool.status !== "disabled") {
    throw new Error(`Tool ${tool.tool_name} status must be "active" or "disabled".`);
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

  const requestedToolName = (match[2] || match[3] || match[4] || "").trim().toLowerCase();

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
  const sanitizedContent = sanitizeShortcutInvocationContent({
    toolName: tool.toolName,
    content,
  });

  if (getToolInputMode(tool) === "raw") {
    const rawFieldName = getRawToolStringFieldName(tool);

    if (!rawFieldName) {
      return {};
    }

    return {
      [rawFieldName]: sanitizedContent,
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
      [stringField]: sanitizedContent,
    };
  }

  const singleStringField = propertyEntries.find(([, value]) => {
    const property = value as { type?: unknown };
    return property.type === "string";
  });

  if (singleStringField && propertyEntries.length === 1) {
    return {
      [singleStringField[0]]: sanitizedContent,
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
      [arrayField]: [sanitizedContent],
    };
  }

  const singleStringArrayField = propertyEntries.find(([, value]) => {
    const property = value as { type?: unknown; items?: { type?: unknown } };
    return property.type === "array" && property.items?.type === "string";
  });

  if (singleStringArrayField && propertyEntries.length === 1) {
    return {
      [singleStringArrayField[0]]: [sanitizedContent],
    };
  }

  return {};
};

export const buildShortcutRawInputText = ({
  tool,
  content,
}: {
  tool: AllowedTool;
  content: string;
}) => {
  if (getToolInputMode(tool) === "raw") {
    return sanitizeShortcutInvocationContent({
      toolName: tool.toolName,
      content,
    });
  }

  return sanitizeShortcutInvocationContent({
    toolName: tool.toolName,
    content,
  });
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

  if (parts.length > 1 && parts.every((part) => TODO_ITEM_VERB_PATTERN.test(part))) {
    return parts;
  }

  return [normalized];
};

export const getRequiredToolArgumentFields = (inputSchema: Record<string, unknown> | undefined) => {
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
    return Boolean(normalized && normalized !== "null" && normalized !== "undefined");
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

export const validateInputText = (text: string, maxBytes = MAX_INPUT_TEXT_BYTES) => {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Input text is required.");
  }
  const byteLength = new TextEncoder().encode(trimmed).length;
  if (byteLength > maxBytes) {
    throw new Error(
      `Input text exceeds maximum size of ${maxBytes} bytes (${(maxBytes / 1024).toFixed(0)}KB).`,
    );
  }
  return trimmed;
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
  const requestedState = typeof args.mock_state === "string" ? args.mock_state : null;

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

export type JsonSchemaValidationError = {
  path: string;
  message: string;
};

const validateJsonSchemaType = (value: unknown, expectedType: string): boolean => {
  switch (expectedType) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "null":
      return value === null;
    default:
      return true;
  }
};

const validateJsonSchemaValue = (
  value: unknown,
  schema: unknown,
  path: string,
  errors: JsonSchemaValidationError[],
): void => {
  if (!schema || typeof schema !== "object") {
    return;
  }

  const s = schema as Record<string, unknown>;

  if (Array.isArray(s.type)) {
    const matched = (s.type as string[]).some((t) => validateJsonSchemaType(value, t));
    if (!matched) {
      errors.push({
        path,
        message: `Expected one of types ${JSON.stringify(s.type)}, got ${JSON.stringify(value)}`,
      });
      return;
    }
  } else if (typeof s.type === "string") {
    if (!validateJsonSchemaType(value, s.type)) {
      errors.push({ path, message: `Expected type ${s.type}, got ${JSON.stringify(value)}` });
      return;
    }
  }

  if (s.enum !== undefined) {
    const enumValues = s.enum as unknown[];
    if (!enumValues.includes(value)) {
      errors.push({
        path,
        message: `Expected one of ${JSON.stringify(enumValues)}, got ${JSON.stringify(value)}`,
      });
    }
  }

  if (typeof value === "string") {
    if (typeof s.minLength === "number" && value.length < s.minLength) {
      errors.push({
        path,
        message: `String length ${value.length} is less than minimum ${s.minLength}`,
      });
    }
    if (typeof s.maxLength === "number" && value.length > s.maxLength) {
      errors.push({
        path,
        message: `String length ${value.length} exceeds maximum ${s.maxLength}`,
      });
    }
    if (typeof s.pattern === "string") {
      const regex = new RegExp(s.pattern);
      if (!regex.test(value)) {
        errors.push({ path, message: `String does not match pattern ${s.pattern}` });
      }
    }
  }

  if (typeof value === "number") {
    if (typeof s.minimum === "number" && value < s.minimum) {
      errors.push({ path, message: `Value ${value} is less than minimum ${s.minimum}` });
    }
    if (typeof s.maximum === "number" && value > s.maximum) {
      errors.push({ path, message: `Value ${value} exceeds maximum ${s.maximum}` });
    }
  }

  if (Array.isArray(value) && s.items !== undefined) {
    const itemsSchema = s.items as Record<string, unknown>;
    for (let i = 0; i < value.length; i++) {
      validateJsonSchemaValue(value[i], itemsSchema, `${path}[${i}]`, errors);
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const properties = s.properties as Record<string, unknown> | undefined;
    const required = s.required as string[] | undefined;
    const additionalProperties = s.additionalProperties;

    if (required) {
      for (const key of required) {
        if (!(key in obj)) {
          errors.push({ path, message: `Missing required property "${key}"` });
        }
      }
    }

    if (properties) {
      for (const [key, propSchema] of Object.entries(properties)) {
        if (key in obj) {
          validateJsonSchemaValue(obj[key], propSchema, `${path}.${key}`, errors);
        }
      }
    }

    if (additionalProperties === false) {
      const allowedKeys = new Set(properties ? Object.keys(properties) : []);
      for (const key of Object.keys(obj)) {
        if (!allowedKeys.has(key)) {
          errors.push({ path, message: `Additional property "${key}" is not allowed` });
        }
      }
    } else if (additionalProperties !== undefined && typeof additionalProperties === "object") {
      const allowedKeys = new Set(properties ? Object.keys(properties) : []);
      for (const key of Object.keys(obj)) {
        if (!allowedKeys.has(key)) {
          validateJsonSchemaValue(obj[key], additionalProperties, `${path}.${key}`, errors);
        }
      }
    }
  }
};

export const validateJsonSchema = (
  value: unknown,
  schema: unknown,
): JsonSchemaValidationError[] => {
  const errors: JsonSchemaValidationError[] = [];
  validateJsonSchemaValue(value, schema, "", errors);
  return errors;
};

export const validateToolArguments = (
  toolName: string,
  args: Record<string, unknown>,
  inputSchema: Record<string, unknown> | undefined,
): void => {
  if (!inputSchema) {
    return;
  }
  const errors = validateJsonSchema(args, inputSchema);
  if (errors.length > 0) {
    const messages = errors.map((e) => `${e.path || "root"}: ${e.message}`).join("; ");
    throw new Error(`Tool "${toolName}" arguments validation failed: ${messages}`);
  }
};
