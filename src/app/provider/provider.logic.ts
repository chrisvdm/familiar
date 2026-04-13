import {
  type ChatMessage,
  createEmptyGlobalMemory,
  flattenGlobalMemoryFacts,
  type GlobalMemory,
  type MemoryFact,
  type ThreadMemory,
} from "../chat/shared.ts";

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
const EXPLICIT_TOOL_REQUEST_PATTERN =
  /^(?:(?:please|pls)\s+)?(?:use|run|call|invoke|send|post|message|dm|email|text|notify|share|publish|create|make|add|save|store|remember|update|edit|change|delete|remove|clear|fetch|search|look\s*up|check)\b/i;
const EXPLICIT_TOOL_REQUEST_WITH_SUBJECT_PATTERN =
  /^(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:use|run|call|invoke|send|post|message|dm|email|text|notify|share|publish|create|make|add|save|store|remember|update|edit|change|delete|remove|clear|fetch|search|look\s*up|check)\b/i;
const EXPLICIT_TOOL_HELP_PATTERN =
  /^(?:i want you to|i need you to|help me|please help me)\s+(?:use|run|call|invoke|send|post|message|dm|email|text|notify|share|publish|create|make|add|save|store|remember|update|edit|change|delete|remove|clear|fetch|search|look\s*up|check)\b/i;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isExplicitToolRequest = (content: string) => {
  const trimmed = content.trim();

  return (
    EXPLICIT_TOOL_REQUEST_PATTERN.test(trimmed) ||
    EXPLICIT_TOOL_REQUEST_WITH_SUBJECT_PATTERN.test(trimmed) ||
    EXPLICIT_TOOL_HELP_PATTERN.test(trimmed)
  );
};

export const extractIntroducedName = (content: string) => {
  const match = content
    .trim()
    .match(/^(?:(?:hi|hello|hey)[,!\s]+)?my name is\s+([a-z][a-z' -]{0,40})[.?!]*$/i);

  if (!match?.[1]) {
    return null;
  }

  const normalized = match[1]
    .trim()
    .split(/\s+/)
    .map((part) =>
      part ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : "",
    )
    .filter(Boolean)
    .join(" ");

  return normalized || null;
};

export const hasExplicitToolUseIntent = ({
  content,
  tools,
}: {
  content: string;
  tools: AllowedTool[];
}) => {
  if (!isExplicitToolRequest(content)) {
    return false;
  }

  const normalizedContent = content.trim();

  return tools
    .filter((tool) => tool.status === "active")
    .some((tool) => {
      const escapedToolName = escapeRegex(tool.toolName.trim());
      const toolMentionPattern = new RegExp(
        `(?:^|[^A-Za-z0-9_])(?:@(?:\\[)?${escapedToolName}(?:\\])?|${escapedToolName})(?=$|[^A-Za-z0-9_])`,
        "i",
      );

      return toolMentionPattern.test(normalizedContent);
    });
};

const BROAD_PERSONAL_MEMORY_QUERY_PATTERN =
  /\b(what do you know about me|what can you tell me about (?:me|myself)|who am i|tell me about myself|tell me what you know about me|summari[sz]e (me|what you know)|what do you remember about me|what do you know of me)\b/i;

const NAME_RECALL_QUERY_PATTERN =
  /\b(do you know my name|what(?:'s| is) my name|tell me my name|remember my name|what name do i go by|the name i call myself)\b/i;

const PERSONAL_MEMORY_FOLLOW_UP_PATTERN =
  /\b(anything (?:you have|you've) stored|anything you know|what else|tell me more|personal details|human me|about human me|as much as possible|everything you have stored)\b/i;

const PERSONAL_MEMORY_CONTEXT_PATTERN =
  /\b(what do you know about me|what can you tell me about (?:me|myself)|tell me about myself|what do you remember about me|do you know my name|what(?:'s| is) my name|your name is|you go by|i know that|i do not know your name yet)\b/i;

const isBareNameRecallPrompt = (content: string) => {
  const trimmed = content.trim().replace(/[.?!]+$/, "");

  if (!trimmed || /\bmy name is\b/i.test(trimmed)) {
    return false;
  }

  return /^(?:my name|name|about my name)$/i.test(trimmed);
};

const getMostRelevantFact = (facts: MemoryFact[]) =>
  [...facts].sort((left, right) => {
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  })[0] ?? null;

const getStoredName = ({
  threadMemory,
  globalMemory,
}: {
  threadMemory: ThreadMemory;
  globalMemory: GlobalMemory;
}) =>
  getMostRelevantFact([
    ...(globalMemory.identity.name ?? []),
    ...threadMemory.facts.filter((fact) => fact.key === "name"),
  ])?.value ?? null;

const dedupeMemoryFacts = (facts: MemoryFact[]) => {
  const seen = new Set<string>();

  return facts.filter((fact) => {
    const key = `${fact.key}:${fact.value.trim().toLowerCase()}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const getPersonalMemoryFacts = ({
  threadMemory,
  globalMemory,
}: {
  threadMemory: ThreadMemory;
  globalMemory: GlobalMemory;
}) =>
  dedupeMemoryFacts([
    ...(globalMemory.identity.name ?? []),
    ...Object.values(globalMemory.identity)
      .flat()
      .filter((fact) => fact.key !== "name"),
    ...Object.values(globalMemory.family).flat(),
    ...Object.values(globalMemory.preferences.favorite).flat(),
    ...globalMemory.preferences.likes,
    ...globalMemory.preferences.dislikes,
    ...globalMemory.preferences.interests,
    ...globalMemory.preferences.fears,
    ...Object.values(globalMemory.preferences.general).flat(),
    ...threadMemory.facts.filter(
      (fact) =>
        ![
          "profession",
          "business",
          "project",
          "product",
          "app",
          "company",
        ].includes(fact.key),
    ),
  ]);

const getExtendedMemoryFacts = ({
  threadMemory,
  globalMemory,
}: {
  threadMemory: ThreadMemory;
  globalMemory: GlobalMemory;
}) =>
  dedupeMemoryFacts([
    ...getPersonalMemoryFacts({
      threadMemory,
      globalMemory,
    }),
    ...flattenGlobalMemoryFacts(globalMemory),
    ...threadMemory.facts,
  ]);

const hasRecentPersonalMemoryContext = (messages: ChatMessage[]) =>
  messages
    .slice(-6)
    .some((message) => PERSONAL_MEMORY_CONTEXT_PATTERN.test(message.content));

const formatMemoryFactForReply = (fact: MemoryFact) => {
  switch (fact.key) {
    case "name":
      return `you go by ${fact.value}`;
    case "children_count":
      return `you have ${fact.value} children`;
    case "profession":
      return `you work as ${
        /^(a|an)\b/i.test(fact.value)
          ? fact.value
          : /^[aeiou]/i.test(fact.value)
            ? `an ${fact.value}`
            : `a ${fact.value}`
      }`;
    case "business":
      return `your business is ${fact.value}`;
    case "location":
      return `you are in ${fact.value}`;
    case "likes":
    case "interest":
    case "interests":
      return `you like ${fact.value}`;
    case "dislikes":
      return `you dislike ${fact.value}`;
    case "favorite":
    case "favorite_food":
    case "favorite_drink":
    case "favorite_music":
    case "favorite_movie":
    case "favorite_color":
      return `your ${fact.key.replace(/_/g, " ")} is ${fact.value}`;
    case "spouse_name":
    case "partner_name":
    case "wife_name":
    case "husband_name":
      return `${fact.key.replace(/_/g, " ")} is ${fact.value}`;
    default:
      return `${fact.key.replace(/_/g, " ")}: ${fact.value}`;
  }
};

const joinMemoryPhrases = (phrases: string[]) => {
  if (phrases.length === 0) {
    return "";
  }

  if (phrases.length === 1) {
    return phrases[0];
  }

  if (phrases.length === 2) {
    return `${phrases[0]} and ${phrases[1]}`;
  }

  return `${phrases.slice(0, -1).join(", ")}, and ${phrases.at(-1)}`;
};

export const buildPersonalMemoryReply = ({
  content,
  messages = [],
  threadMemory,
  globalMemory,
}: {
  content: string;
  messages?: ChatMessage[];
  threadMemory: ThreadMemory;
  globalMemory: GlobalMemory;
}) => {
  const isNameRecall =
    NAME_RECALL_QUERY_PATTERN.test(content) || isBareNameRecallPrompt(content);
  const isFollowUpMemoryRecall =
    PERSONAL_MEMORY_FOLLOW_UP_PATTERN.test(content) &&
    hasRecentPersonalMemoryContext(messages);
  const isBroadMemoryRecall =
    BROAD_PERSONAL_MEMORY_QUERY_PATTERN.test(content) || isFollowUpMemoryRecall;
  const prefersPersonalDetails =
    /\b(personal details|human me|about human me)\b/i.test(content);

  if (!isBroadMemoryRecall && !isNameRecall) {
    return null;
  }

  if (isNameRecall) {
    const storedName = getStoredName({
      threadMemory,
      globalMemory,
    });

    return storedName
      ? `You go by ${storedName}.`
      : "I do not know your name yet.";
  }

  const storedFacts = (
    prefersPersonalDetails
      ? getPersonalMemoryFacts({
          threadMemory,
          globalMemory,
        })
      : getExtendedMemoryFacts({
          threadMemory,
          globalMemory,
        })
  ).slice(0, 5);

  if (storedFacts.length === 0) {
    return "I do not know much about you yet.";
  }

  return `I know that ${joinMemoryPhrases(
    storedFacts.map((fact) => formatMemoryFactForReply(fact)),
  )}.`;
};

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
