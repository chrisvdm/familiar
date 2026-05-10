import { env } from "cloudflare:workers";
import { requestInfo } from "rwsdk/worker";

import { callOpenRouter as callOpenRouterClient, callOpenRouterStream } from "./openrouter.client";
import {
  synthesizeUserProfile,
} from "../chat/chat.memory";
import { createMemoryBackend } from "../memory/memory.factory";
import {
  buildPromptContext,
  createDateTimeSystemPrompt,
  DEFAULT_MODEL,
  resolveConversationTimeZone,
} from "../chat/conversation.runtime";
import {
  deleteChatSession,
  loadChatSession,
  saveChatSession,
} from "../chat/chat.storage";
import {
  buildGlobalMemoryMarkdown,
  createAssistantMessage,
  createEmptyGlobalMemory,
  createInitialChatState,
  createThreadSummary,
  createUserMessage,
  getThreadTitleFromMessages,
  pruneGlobalMemoryByThreadId,
  type ChatMessage,
  type PendingToolConfirmation,
  type ChatSessionState,
  type ChatThreadSummary,
  type GlobalMemory,
} from "../chat/shared";
import type {
  AllowedTool,
  ProviderChannelInput,
  ProviderConfig,
  ProviderConversationInput,
  ProviderConversationResponseKind,
  ProviderExecutionState,
  ProviderExecutorResultInput,
  ProviderToolSyncInput,
  ProviderUserContext,
} from "./provider.types";
import { logProviderAudit } from "./provider.audit";
import {
  executeProviderToolRequest,
  sendProviderChannelMessage,
} from "./provider.execution";
import {
  applyConversationRateLimit,
  buildShortcutRawInputText,
  buildShortcutToolArguments,
  clampDecisionConfidence,
  CONVERSATION_RATE_LIMIT_MAX_REQUESTS,
  CONVERSATION_RATE_LIMIT_WINDOW_MS,
  extractToolStringValue,
  getRawToolStringFieldName,
  getToolInputMode,
  getMissingRequiredToolArgumentFields,
  getToolDecisionConfidenceAction,
  hasMeaningfulToolArgumentValue,
  interpretPendingToolConfirmation,
  parseToolShortcutInvocation,
  parseToolShortcutInvocations,
  sanitizeRawToolInput,
  selectProviderGlobalMemory,
  splitTodoItemsFromText,
  TOOLS_SYNC_RATE_LIMIT_MAX_REQUESTS,
  TOOLS_SYNC_RATE_LIMIT_WINDOW_MS,
  validateToolInputMode,
} from "./provider.logic";
import {
  loadOrCreateProviderUserContext,
  saveProviderUserContext,
} from "./provider.storage";

type NormalizedProviderConversationInput = ProviderConversationInput & {
  integration_id: string;
  user_id: string;
};

type NormalizedProviderExecutorResultInput = ProviderExecutorResultInput & {
  integration_id: string;
  user_id: string;
};

type NormalizedProviderToolSyncInput = ProviderToolSyncInput & {
  integration_id: string;
  user_id: string;
};


type ConversationDecision =
  | {
      action: "direct_reply";
      reply: string;
      reasoning?: string;
    }
  | {
      action: "clarification";
      question: string;
      reasoning?: string;
    }
  | {
      action: "tool_call";
      tool_name: string;
      arguments: Record<string, unknown>;
      confidence?: number;
      reasoning?: string;
    }
  | {
      action: "tool_follow_up";
      tool_name: string;
      arguments: Record<string, unknown>;
      question: string;
      confidence?: number;
      reasoning?: string;
    };

type RawConversationDecision = {
  tool?: string;
  arguments?: Record<string, unknown>;
  data?: Record<string, unknown>;
  reasoning?: string;
  follow_up?: string | null;
  followUp?: string | null;
  confidence?: number;
};

type RawToolArgumentUpdate = {
  arguments?: Record<string, unknown>;
  follow_up?: string | null;
  followUp?: string | null;
};

class ProviderRateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Rate limit exceeded.");
    this.name = "ProviderRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const SYSTEM_PROMPT =
  "You are familiar, a concise conversational orchestration assistant. Return direct, useful replies without filler.";

const TOOL_DECISION_PROMPT = [
  "Analyze the user input and determine the user's intent.",
  "Based on the intent, determine which tool is best suited to handle the request.",
  "Return strict JSON only. No markdown fences. No function call syntax. No code blocks.",
  "Your entire response must be a single JSON object with exactly these five keys: tool, arguments, reasoning, follow_up, confidence.",
  'Tool call example: {"tool":"todos.add","arguments":{"todo_items":["buy milk"]},"reasoning":"User wants to add a todo item.","follow_up":null,"confidence":0.9}',
  'No-tool example: {"tool":"none","arguments":{},"reasoning":"User is making a statement, not requesting an action.","follow_up":null,"confidence":0.0}',
  "Use tool = none when the user is not clearly asking to use one of the available tools.",
  "Do not call a tool for ordinary statements or facts unless the user is clearly asking to save, update, send, create, delete, or run something.",
  "If the request is missing required details for a tool, still choose the tool if appropriate, fill in the information you do have, and return a follow_up question for the missing information.",
  "Include a confidence score between 0 and 1 for how certain you are that this is the right tool choice.",
  "Arguments must contain only the extracted values for the tool schema.",
  "If a schema field is an array, return an array that already matches the schema instead of one joined string.",
  "Do not include instruction words or filler in arguments.",
  "Use tool = none for ordinary conversation, introductions, opinions, preferences, or future-thinking statements unless the user is clearly asking to save, remember, add, send, create, update, delete, or run something.",
  'Example: if the user says "add wash hair to note", the note argument should be "wash hair", not "add wash hair to note".',
  'Example: if the schema requires todo_items and the user says "call dad and buy milk", return {"todo_items":["call dad","buy milk"]}.',
  'Example: if the user says "my name is john", that is a direct reply or normal conversation unless the user explicitly asks to save it.',
  'Example: if the user says "i want to retire", that is normal conversation, not a todo.',
  'Example: if the user says "i think i will buy canidae", that is a statement unless they are clearly asking to add it as a task.',
].join("\n");

const TOOL_ARGUMENT_UPDATE_PROMPT = [
  "You are updating arguments for one already-selected tool.",
  "Return strict JSON only. No markdown fences.",
  'Use exactly this shape: {"arguments":{},"follow_up":"string|null"}',
  "Merge the new user reply into the existing partial arguments.",
  "Keep any valid existing argument values unless the user clearly corrects them.",
  "Arguments must contain only the extracted values for the tool schema.",
  "If a schema field is an array, keep it as an array instead of collapsing it into one string.",
  "If required information is still missing, return a follow_up question.",
  "If the required information is now complete, return follow_up as null.",
].join("\n");

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "from",
  "have",
  "into",
  "that",
  "the",
  "this",
  "with",
  "your",
]);

const buildChannelKey = (channel: ProviderChannelInput) =>
  `${channel.type.trim().toLowerCase()}:${channel.id.trim()}`;

const getRequestTimeZone = (timeZone?: string | null) =>
  resolveConversationTimeZone(timeZone);

const normalizeAllowedTools = (
  tools: Array<{
    tool_name: string;
    description: string;
    input_schema: Record<string, unknown>;
    input_mode?: "processed" | "raw";
    executor_payload?: unknown;
    policy?: Record<string, unknown>;
    status?: "active" | "disabled";
  }>,
): AllowedTool[] =>
  tools.map((tool) => {
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

export const WEB_PROVIDER_ID = "texty_web";

const providerEnv = env as typeof env & {
  AI?: {
    run: (model: string, inputs: Record<string, unknown>) => Promise<unknown>;
  };
  CLOUDFLARE_DECISION_MODEL?: string;
  CLOUDFLARE_ROUTING_MODEL?: string;
  CLOUDFLARE_EXTRACTION_MODEL?: string;
  TEXTY_USE_WORKERS_AI_ROUTING?: string;
  OPENROUTER_DECISION_MODEL?: string;
  OPENROUTER_ROUTING_MODEL?: string;
  OPENROUTER_EXTRACTION_MODEL?: string;
  OPENROUTER_ROUTER_MODEL?: string;
};

const getCloudflareRoutingModel = () =>
  providerEnv.CLOUDFLARE_ROUTING_MODEL?.trim() ||
  providerEnv.CLOUDFLARE_DECISION_MODEL?.trim() ||
  "@cf/meta/llama-3.1-8b-instruct-fast";

const getCloudflareExtractionModel = () =>
  providerEnv.CLOUDFLARE_EXTRACTION_MODEL?.trim() ||
  providerEnv.CLOUDFLARE_ROUTING_MODEL?.trim() ||
  providerEnv.CLOUDFLARE_DECISION_MODEL?.trim() ||
  "@cf/qwen/qwen3-30b-a3b-fp8";

const getOpenRouterRoutingModel = () =>
  providerEnv.OPENROUTER_ROUTING_MODEL?.trim() ||
  providerEnv.OPENROUTER_DECISION_MODEL?.trim() ||
  providerEnv.OPENROUTER_ROUTER_MODEL?.trim() ||
  DEFAULT_MODEL;

const getOpenRouterExtractionModel = () =>
  providerEnv.OPENROUTER_EXTRACTION_MODEL?.trim() ||
  providerEnv.OPENROUTER_ROUTING_MODEL?.trim() ||
  providerEnv.OPENROUTER_DECISION_MODEL?.trim() ||
  providerEnv.OPENROUTER_ROUTER_MODEL?.trim() ||
  DEFAULT_MODEL;

const shouldUseWorkersAiRouting = () =>
  providerEnv.TEXTY_USE_WORKERS_AI_ROUTING?.trim().toLowerCase() === "true";

const sortThreadsByRecency = (threads: ChatThreadSummary[]) =>
  [...threads].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const updateThreadSummaries = (
  threads: ChatThreadSummary[],
  nextSummary: ChatThreadSummary,
) =>
  sortThreadsByRecency(
    threads.map((thread) => (thread.id === nextSummary.id ? nextSummary : thread)),
  );

const buildThreadSummary = (
  currentSummary: ChatThreadSummary,
  messages: ChatMessage[],
) => ({
  ...currentSummary,
  title: currentSummary.isTitleEdited
    ? currentSummary.title
    : getThreadTitleFromMessages(messages),
  updatedAt: messages.at(-1)?.createdAt || currentSummary.updatedAt,
  messageCount: messages.length,
});

const tokenize = (input: string) =>
  input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));

const scoreThreadFit = ({
  content,
  thread,
  session,
}: {
  content: string;
  thread: ChatThreadSummary;
  session: ChatSessionState;
}) => {
  const contentTokens = new Set(tokenize(content));

  if (contentTokens.size === 0) {
    return 0;
  }

  const threadCorpus = [
    thread.title,
    session.memory.summary,
    ...session.messages.slice(-4).map((message) => message.content),
  ].join(" ");
  const threadTokens = new Set(tokenize(threadCorpus));
  let matches = 0;

  for (const token of contentTokens) {
    if (threadTokens.has(token)) {
      matches += 1;
    }
  }

  return matches / Math.max(contentTokens.size, 1);
};

const buildDirectReply = async ({
  content,
  messages,
  memoryContext,
  replyModel,
  timeZone,
  aiApiKey,
}: {
  content: string;
  messages: ChatMessage[];
  memoryContext: string | null;
  replyModel: string;
  timeZone?: string | null;
  aiApiKey?: string;
}) => {
  return callOpenRouter({
    model: replyModel,
    timeZone,
    aiApiKey,
    messages: [
      {
        role: "system" as const,
        content:
          "You are familiar. Reply directly to the user in a brief, natural, human-facing way. Do not describe tool-selection reasoning or internal decision logic.",
      },
      ...(memoryContext
        ? [
            {
              role: "system" as const,
              content: memoryContext,
            },
          ]
        : []),
      ...buildPromptContext([...messages, createUserMessage(content)]),
    ],
  });
};

const buildDirectReplyStream = async function* ({
  content,
  messages,
  memoryContext,
  replyModel,
  timeZone,
  aiApiKey,
}: {
  content: string;
  messages: ChatMessage[];
  memoryContext: string | null;
  replyModel: string;
  timeZone?: string | null;
  aiApiKey?: string;
}): AsyncGenerator<string, void, unknown> {
  const apiKey = aiApiKey || env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  yield* callOpenRouterStream({
    apiKey,
    model: replyModel,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: createDateTimeSystemPrompt({ timeZone }) },
      {
        role: "system",
        content:
          "You are familiar. Reply directly to the user in a brief, natural, human-facing way. Do not describe tool-selection reasoning or internal decision logic.",
      },
      ...(memoryContext
        ? [
            {
              role: "system" as const,
              content: memoryContext,
            },
          ]
        : []),
      ...buildPromptContext([...messages, createUserMessage(content)]),
    ],
  });
};

const shouldReuseChannelThread = async ({
  content,
  context,
  threadId,
}: {
  content: string;
  context: ProviderUserContext;
  threadId: string;
}) => {
  const thread = context.threads.find((entry) => entry.id === threadId);

  if (!thread) {
    return false;
  }

  const session = await loadChatSession(threadId);

  if (session.messages.length === 0) {
    return true;
  }

  if (session.pendingToolConfirmation) {
    return true;
  }

  return scoreThreadFit({ content, thread, session }) >= 0.2;
};

const resolveThreadId = async ({
  context,
  providedThreadId,
  channel,
  content,
}: {
  context: ProviderUserContext;
  providedThreadId?: string;
  channel: ProviderChannelInput;
  content: string;
}) => {
  const normalizedThreadId = providedThreadId?.trim();

  if (normalizedThreadId) {
    const threadExists = context.threads.some(
      (thread) => thread.id === normalizedThreadId,
    );

    if (!threadExists) {
      throw new Error("Thread not found for this provider user.");
    }

    return normalizedThreadId;
  }

  const channelState = context.channels[buildChannelKey(channel)];

  if (channelState?.lastActiveThreadId) {
    const canReuse = await shouldReuseChannelThread({
      content,
      context,
      threadId: channelState.lastActiveThreadId,
    });

    if (canReuse) {
      return channelState.lastActiveThreadId;
    }
  }

  return null;
};

const createThreadForContext = async ({
  context,
  isPrivate = false,
  channel,
}: {
  context: ProviderUserContext;
  isPrivate?: boolean;
  channel: ProviderChannelInput;
}) => {
  const threadId = crypto.randomUUID();
  const nextState = createInitialChatState();

  await saveChatSession(threadId, nextState);

  const nextThread = createThreadSummary(threadId, nextState.messages.length, {
    isTemporary: isPrivate,
  });
  const channelKey = buildChannelKey(channel);
  const nextContext: ProviderUserContext = {
    ...context,
    threads: sortThreadsByRecency([nextThread, ...context.threads]),
    channels: {
      ...context.channels,
      [channelKey]: {
        type: channel.type,
        id: channel.id,
        lastActiveThreadId: threadId,
        updatedAt: new Date().toISOString(),
      },
    },
    threadChannels: updateThreadChannelState({
      context,
      channel,
      threadId,
    }),
  };

  await saveProviderUserContext(nextContext);

  return { context: nextContext, threadId, session: nextState };
};

const parseJsonObject = <T,>(content: string): T | null => {
  const trimmed = content.trim();
  const candidate =
    trimmed.startsWith("{") && trimmed.endsWith("}")
      ? trimmed
      : trimmed.match(/\{[\s\S]*\}/)?.[0];

  if (!candidate) {
    return null;
  }

  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
};

const normalizeNullableModelText = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.toLowerCase() === "null" || trimmed.toLowerCase() === "undefined") {
    return "";
  }

  return trimmed;
};

const buildDecisionReasoning = (value: unknown) => {
  const normalized = normalizeNullableModelText(value);
  return normalized || null;
};

const enforceConversationRateLimit = ({
  context,
}: {
  context: ProviderUserContext;
}) => {
  const result = applyConversationRateLimit({
    timestamps: context.requestLog?.conversationInputTimestamps ?? [],
    maxRequests: CONVERSATION_RATE_LIMIT_MAX_REQUESTS,
    windowMs: CONVERSATION_RATE_LIMIT_WINDOW_MS,
  });

  if (!result.allowed) {
    throw new ProviderRateLimitError(result.retryAfterSeconds);
  }

  return {
    ...context,
    requestLog: {
      ...context.requestLog,
      conversationInputTimestamps: result.timestamps,
    },
  };
};

const enforceToolsSyncRateLimit = ({
  context,
}: {
  context: ProviderUserContext;
}) => {
  const result = applyConversationRateLimit({
    timestamps: context.requestLog?.toolSyncTimestamps ?? [],
    maxRequests: TOOLS_SYNC_RATE_LIMIT_MAX_REQUESTS,
    windowMs: TOOLS_SYNC_RATE_LIMIT_WINDOW_MS,
  });

  if (!result.allowed) {
    throw new ProviderRateLimitError(result.retryAfterSeconds);
  }

  return {
    ...context,
    requestLog: {
      ...context.requestLog,
      toolSyncTimestamps: result.timestamps,
    },
  };
};

const callOpenRouter = async ({
  messages,
  model,
  timeZone,
  jsonMode = false,
  aiApiKey,
}: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model: string;
  timeZone?: string | null;
  jsonMode?: boolean;
  aiApiKey?: string;
}) => {
  const apiKey = aiApiKey || env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const content = await callOpenRouterClient({
    apiKey,
    model,
    siteUrl: env.OPENROUTER_SITE_URL || "http://localhost:5173",
    siteName: env.OPENROUTER_SITE_NAME || "familiar",
    jsonMode,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: createDateTimeSystemPrompt({ timeZone }) },
      ...messages,
    ],
  });

  if (!content) {
    throw new Error("OpenRouter did not return a response message.");
  }

  return content;
};

const extractCloudflareAiText = (payload: unknown): string | null => {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = payload as {
    response?: unknown;
    result?: { response?: unknown };
  };

  if (typeof value.response === "string" && value.response.trim()) {
    return value.response.trim();
  }

  if (
    value.result &&
    typeof value.result === "object" &&
    typeof value.result.response === "string" &&
    value.result.response.trim()
  ) {
    return value.result.response.trim();
  }

  return null;
};

const callDecisionModel = async ({
  messages,
  timeZone,
  stage = "routing",
  aiApiKey,
}: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  timeZone?: string | null;
  stage?: "routing" | "extraction";
  aiApiKey?: string;
}) => {
  if (providerEnv.AI && shouldUseWorkersAiRouting()) {
    const cfModel = stage === "extraction" ? getCloudflareExtractionModel() : getCloudflareRoutingModel();
    try {
      const payload = await providerEnv.AI.run(
        cfModel,
        {
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT,
            },
            {
              role: "system",
              content: createDateTimeSystemPrompt({ timeZone }),
            },
            ...messages,
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              type: "object",
              properties: {
                tool: { type: "string" },
                arguments: { type: "object" },
                reasoning: { type: "string" },
                follow_up: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["tool", "arguments", "reasoning", "confidence"],
            },
          },
          max_tokens: 300,
          temperature: 0.1,
        },
      );

      const content = extractCloudflareAiText(payload);

      if (content) {
        return content;
      }
    } catch (error) {
      console.warn("Cloudflare AI decision model failed, falling back to OpenRouter.", error);
    }
  }

  return callOpenRouter({
    model: stage === "extraction" ? getOpenRouterExtractionModel() : getOpenRouterRoutingModel(),
    timeZone,
    aiApiKey,
    messages,
    jsonMode: true,
  });
};

const formatAllowedTools = (tools: AllowedTool[]) => {
  if (tools.length === 0) {
    return "(none)";
  }

  return tools
    .filter((tool) => tool.status === "active")
    .map(
      (tool) =>
        `- ${tool.toolName}: ${tool.description}\n  schema=${JSON.stringify(
          tool.inputSchema,
        )}\n  input_mode=${tool.inputMode}\n  policy=${JSON.stringify(tool.policy)}`,
    )
    .join("\n");
};

const scoreToolRelevance = ({
  tool,
  content,
}: {
  tool: AllowedTool;
  content: string;
}) => {
  const contentTokens = new Set(tokenize(content));

  if (contentTokens.size === 0) {
    return 0;
  }

  const toolCorpus = [
    tool.toolName,
    tool.description,
    JSON.stringify(tool.inputSchema),
  ].join(" ");
  const toolTokens = new Set(tokenize(toolCorpus));
  let matches = 0;

  for (const token of contentTokens) {
    if (toolTokens.has(token)) {
      matches += 1;
    }
  }

  return matches / Math.max(contentTokens.size, 1);
};

const getCandidateTools = ({
  tools,
  content,
}: {
  tools: AllowedTool[];
  content: string;
}) => {
  const activeTools = tools.filter((tool) => tool.status === "active");

  if (activeTools.length <= 3) {
    return activeTools;
  }

  const ranked = activeTools
    .map((tool) => ({
      tool,
      score: scoreToolRelevance({
        tool,
        content,
      }),
    }))
    .sort((left, right) => right.score - left.score);

  const bestScore = ranked[0]?.score ?? 0;

  if (bestScore <= 0) {
    return activeTools.slice(0, 3);
  }

  return ranked
    .filter((entry, index) => index < 3 || entry.score === bestScore)
    .slice(0, 3)
    .map((entry) => entry.tool);
};

const buildMissingToolArgumentQuestion = ({
  tool,
  missingFields,
}: {
  tool: AllowedTool;
  missingFields: string[];
}) => {
  if (tool.toolName === "todos.add") {
    return "What todo items should I add?";
  }

  const properties =
    tool.inputSchema &&
    typeof tool.inputSchema === "object" &&
    tool.inputSchema.properties &&
    typeof tool.inputSchema.properties === "object"
      ? (tool.inputSchema.properties as Record<string, unknown>)
      : {};

  const fieldLabels = missingFields.map((field) => {
    const property = properties[field];

    if (property && typeof property === "object") {
      const description = (property as { description?: unknown }).description;

      if (typeof description === "string" && description.trim()) {
        return description.trim().replace(/[.]+$/, "");
      }
    }

    return field;
  });

  if (fieldLabels.length === 1) {
    return `I still need ${fieldLabels[0]} before I can use ${tool.toolName}.`;
  }

  return `I still need ${fieldLabels.join(" and ")} before I can use ${tool.toolName}.`;
};

const validateToolDecision = ({
  tool,
  args,
}: {
  tool: AllowedTool;
  args: Record<string, unknown>;
}) => {
  const missingFields = getMissingRequiredToolArgumentFields({
    inputSchema: tool.inputSchema,
    args,
  });

  return {
    missingFields,
    isComplete: missingFields.length === 0,
  };
};

const normalizeToolArguments = ({
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

const normalizeToolExecutionInput = ({
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

const buildToolConfirmationQuestion = ({
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

const buildLowConfidenceToolQuestion = () =>
  "I am not confident enough to pick the right tool yet. Can you say a bit more about what you want me to do?";

const buildPendingConfirmationReminder = ({
  tool,
}: {
  tool?: AllowedTool;
}) => {
  const toolLabel = tool?.description?.trim()
    ? `${tool.toolName} (${tool.description.trim()})`
    : tool?.toolName || "that tool";

  return `I was asking whether you wanted me to use ${toolLabel}. Please answer yes or no.`;
};

export const decideConversationAction = async ({
  content,
  messages,
  memoryContext,
  tools,
  replyModel,
  timeZone,
  aiApiKey,
  generateReply = true,
}: {
  content: string;
  messages: ChatMessage[];
  memoryContext: string | null;
  tools: AllowedTool[];
  replyModel: string;
  timeZone?: string | null;
  aiApiKey?: string;
  generateReply?: boolean;
}) => {
  if (tools.filter((tool) => tool.status === "active").length === 0) {
    if (!generateReply) {
      return {
        action: "direct_reply",
        reply: "",
      } satisfies ConversationDecision;
    }

    const reply = await buildDirectReply({
      content,
      messages,
      memoryContext,
      replyModel,
      timeZone,
      aiApiKey,
    });

    return {
      action: "direct_reply",
      reply,
    } satisfies ConversationDecision;
  }

  const candidateTools = getCandidateTools({
    tools,
    content,
  });

  const decision = await callDecisionModel({
    timeZone,
    stage: "routing",
    aiApiKey,
    messages: [
      {
        role: "system",
        content: TOOL_DECISION_PROMPT,
      },
      ...(memoryContext
        ? [
            {
              role: "system" as const,
              content: memoryContext,
            },
          ]
        : []),
      {
        role: "user",
        content: [
          "Available tools:",
          formatAllowedTools(candidateTools),
          "",
          "Choose only from these exact tool names or use none.",
          "",
          "Recent conversation:",
          JSON.stringify(
            messages.slice(-6).map((message) => ({
              role: message.role,
              content: message.content,
            })),
          ),
          "",
          `New user message: ${JSON.stringify(content)}`,
        ].join("\n"),
      },
    ],
  });

  const parsed = parseJsonObject<RawConversationDecision>(decision);

  if (!parsed) {
    return {
      action: "direct_reply",
      reply: decision,
    } satisfies ConversationDecision;
  }

  const requestedTool = typeof parsed.tool === "string" ? parsed.tool.trim() : "";
  const followUp = normalizeNullableModelText(parsed.follow_up ?? parsed.followUp);
  const reasoning = buildDecisionReasoning(parsed.reasoning);

  if (!requestedTool || requestedTool.toLowerCase() === "none") {
    if (followUp) {
      return {
        action: "clarification",
        question: followUp,
        reasoning: reasoning ?? undefined,
      } satisfies ConversationDecision;
    }

    if (!generateReply) {
      return {
        action: "direct_reply",
        reply: "",
        reasoning: reasoning ?? undefined,
      } satisfies ConversationDecision;
    }

    const reply = await buildDirectReply({
      content,
      messages,
      memoryContext,
      replyModel,
      timeZone,
      aiApiKey,
    });

    return {
      action: "direct_reply",
      reply,
      reasoning: reasoning ?? undefined,
    } satisfies ConversationDecision;
  }

  const matchingTool = tools.find((tool) => tool.toolName === requestedTool);

  if (!matchingTool) {
    return {
      action: "clarification",
      question:
        followUp ||
        "I could not match that request to an available tool. Can you say more about what you want me to do?",
      reasoning: reasoning ?? undefined,
    } satisfies ConversationDecision;
  }

  if (followUp) {
    const extractedArguments =
      parsed.arguments && typeof parsed.arguments === "object"
        ? parsed.arguments
        : parsed.data && typeof parsed.data === "object"
          ? parsed.data
          : {};
    const validation = validateToolDecision({
      tool: matchingTool,
      args: extractedArguments,
    });

    return {
      action: "tool_follow_up",
      tool_name: matchingTool.toolName,
      arguments: extractedArguments,
      question:
        validation.isComplete || validation.missingFields.length === 0
          ? followUp
          : buildMissingToolArgumentQuestion({
              tool: matchingTool,
              missingFields: validation.missingFields,
            }),
      confidence: clampDecisionConfidence(parsed.confidence),
      reasoning: reasoning ?? undefined,
    } satisfies ConversationDecision;
  }

  const extractedArguments =
    parsed.arguments && typeof parsed.arguments === "object"
      ? parsed.arguments
      : parsed.data && typeof parsed.data === "object"
        ? parsed.data
        : {};
  const validation = validateToolDecision({
    tool: matchingTool,
    args: extractedArguments,
  });

  if (!validation.isComplete) {
    return {
      action: "tool_follow_up",
      tool_name: matchingTool.toolName,
      arguments: extractedArguments,
      question: buildMissingToolArgumentQuestion({
        tool: matchingTool,
        missingFields: validation.missingFields,
      }),
      confidence: clampDecisionConfidence(parsed.confidence),
      reasoning: reasoning ?? undefined,
    } satisfies ConversationDecision;
  }

  return {
    action: "tool_call",
    tool_name: matchingTool.toolName,
    arguments: extractedArguments,
    confidence: clampDecisionConfidence(parsed.confidence),
    reasoning: reasoning ?? undefined,
  } satisfies ConversationDecision;
};

const updatePendingToolArguments = async ({
  tool,
  currentArguments,
  userReply,
  question,
  timeZone,
  aiApiKey,
}: {
  tool: AllowedTool;
  currentArguments: Record<string, unknown>;
  userReply: string;
  question?: string;
  timeZone?: string | null;
  aiApiKey?: string;
}) => {
  const decision = await callDecisionModel({
    timeZone,
    stage: "extraction",
    aiApiKey,
    messages: [
      {
        role: "system",
        content: TOOL_ARGUMENT_UPDATE_PROMPT,
      },
      {
        role: "user",
        content: [
          `Tool name: ${tool.toolName}`,
          `Tool description: ${tool.description}`,
          `Tool schema: ${JSON.stringify(tool.inputSchema)}`,
          `Current arguments: ${JSON.stringify(currentArguments)}`,
          `Previous follow-up question: ${JSON.stringify(question || null)}`,
          `New user reply: ${JSON.stringify(userReply)}`,
        ].join("\n"),
      },
    ],
  });

  const parsed = parseJsonObject<RawToolArgumentUpdate>(decision);

  if (!parsed) {
    return {
      arguments: currentArguments,
      followUp: question || "I still need a bit more information before I can continue.",
    };
  }

  const followUp =
    normalizeNullableModelText(parsed.follow_up ?? parsed.followUp);

  return {
    arguments:
      parsed.arguments && typeof parsed.arguments === "object"
        ? parsed.arguments
        : currentArguments,
    followUp:
      followUp ||
      (() => {
        const missingFields = getMissingRequiredToolArgumentFields({
          inputSchema: tool.inputSchema,
          args:
            parsed.arguments && typeof parsed.arguments === "object"
              ? parsed.arguments
              : currentArguments,
        });

        return missingFields.length > 0
          ? buildMissingToolArgumentQuestion({
              tool,
              missingFields,
            })
          : null;
      })(),
  };
};

const executeProviderTool = async ({
  providerConfig,
  providerId,
  userId,
  threadId,
  toolName,
  args,
  executorPayloadTemplate,
  channel,
  rawInputText,
  shortcutMode,
  requestId,
}: {
  providerConfig: ProviderConfig;
  providerId: string;
  userId: string;
  threadId: string;
  toolName: string;
  args: Record<string, unknown>;
  executorPayloadTemplate?: unknown;
  channel?: ProviderChannelInput;
  rawInputText?: string;
  shortcutMode?: boolean;
  requestId?: string;
}) => {
  const requestUrl = requestInfo?.request?.url;
  const resultWebhookUrl = requestUrl
    ? `${new URL(requestUrl).origin}/api/v1/webhooks/executor`
    : null;

  return executeProviderToolRequest({
    providerConfig,
    providerId,
    userId,
    threadId,
    toolName,
    args,
    requestId,
    channel,
    resultWebhookUrl,
    rawInputText,
    shortcutMode,
    executorPayloadTemplate,
  });
};

const updateChannelState = ({
  context,
  channel,
  threadId,
}: {
  context: ProviderUserContext;
  channel: ProviderChannelInput;
  threadId: string;
}) => ({
  ...context.channels,
  [buildChannelKey(channel)]: {
    type: channel.type,
    id: channel.id,
    lastActiveThreadId: threadId,
    updatedAt: new Date().toISOString(),
  },
});

const updateThreadChannelState = ({
  context,
  channel,
  threadId,
}: {
  context: ProviderUserContext;
  channel: ProviderChannelInput;
  threadId: string;
}) => ({
  ...context.threadChannels,
  [threadId]: {
    type: channel.type,
    id: channel.id,
  },
});

const scheduleBackgroundTask = (task: Promise<unknown>) => {
  try {
    requestInfo?.cf?.waitUntil?.(task);
  } catch {
    void task;
  }
};

const getConversationResponseKind = ({
  action,
  executionState,
  pendingToolConfirmation,
}: {
  action: "direct_reply" | "clarification" | "tool_call" | "command";
  executionState?: ProviderExecutionState;
  pendingToolConfirmation: PendingToolConfirmation | null;
}): ProviderConversationResponseKind => {
  if (action === "tool_call") {
    return "task_result";
  }

  if (action === "clarification") {
    return pendingToolConfirmation?.mode === "confirmation"
      ? "confirmation"
      : "follow_up";
  }

  return "chat";
};

const appendMessagesToThread = async ({
  threadId,
  messages,
  pendingToolConfirmation,
}: {
  threadId: string;
  messages: ChatMessage[];
  pendingToolConfirmation?: PendingToolConfirmation | null;
}) => {
  const currentState = await loadChatSession(threadId);
  const nextState = {
    ...currentState,
    messages: [...currentState.messages, ...messages],
    pendingToolConfirmation:
      pendingToolConfirmation === undefined
        ? currentState.pendingToolConfirmation
        : pendingToolConfirmation,
    activeToolShortcut: null,
  };

  await saveChatSession(threadId, nextState);
  return nextState;
};

const refreshProviderMemories = async ({
  threadId,
  state,
  thread,
  context,
  isPrivate,
  timeZone,
  aiApiKey,
}: {
  threadId: string;
  state: ChatSessionState;
  thread: ChatThreadSummary;
  context: ProviderUserContext;
  isPrivate: boolean;
  timeZone?: string | null;
  aiApiKey?: string;
}) => {
  try {
    const memoryBackend = createMemoryBackend();
    const refreshed = await memoryBackend.store({
      userId: context.userId,
      integrationId: context.providerId,
      threadId,
      messages: state.messages,
      previousThreadMemory: state.memory,
      globalMemory: isPrivate ? createEmptyGlobalMemory() : context.globalMemory,
      timeZone,
      aiApiKey,
    });

    const nextThreadState = {
      ...state,
      memory: refreshed.threadMemory,
    };

    await saveChatSession(threadId, nextThreadState);

    const nextGlobalMemory = isPrivate ? context.globalMemory : refreshed.globalMemory;
    const nextThreads = updateThreadSummaries(
      context.threads,
      buildThreadSummary(thread, nextThreadState.messages),
    );

    const nextContext: ProviderUserContext = {
      ...context,
      globalMemory: nextGlobalMemory,
      threads: nextThreads,
    };

    await saveProviderUserContext(nextContext);

    return {
      state: nextThreadState,
      context: nextContext,
    };
  } catch (error) {
    console.warn("Unable to refresh provider memories", error);
    return {
      state,
      context,
    };
  }
};

const SYNTHESIS_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_SYNTHESIS_THREADS = 3;
const MAX_SYNTHESIS_MESSAGES = 40;

const isSynthesisDue = (context: ProviderUserContext): boolean => {
  if (!context.nextSynthesis) {
    return true;
  }

  return new Date(context.nextSynthesis) <= new Date();
};

const isCalibrationRequest = (message: string): boolean =>
  /\b(analys[ei](?:se|ze|s)? (my|of my) (behaviour|behavior|speech|communication|personality|style|writing)|how (do|would) i (come across|sound)|what (kind of person|personality) (am i|do i have)|how i (communicate|talk|write)|calibrat(e|ing|ion))\b/i.test(
    message,
  );

const runProfileSynthesis = async ({
  context,
  timeZone,
  aiApiKey,
}: {
  context: ProviderUserContext;
  timeZone?: string | null;
  aiApiKey?: string;
}): Promise<ProviderUserContext> => {
  try {
    const recentThreads = [...context.threads]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_SYNTHESIS_THREADS);

    const allMessages: ChatMessage[] = [];

    for (const thread of recentThreads) {
      const session = await loadChatSession(thread.id);
      allMessages.push(...session.messages);
    }

    const messages = allMessages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, MAX_SYNTHESIS_MESSAGES);

    const updatedMemory = await synthesizeUserProfile({
      messages,
      globalMemory: context.globalMemory,
      timeZone,
      aiApiKey,
    });

    const now = new Date().toISOString();
    const nextSynthesis = new Date(Date.now() + SYNTHESIS_INTERVAL_MS).toISOString();

    return await saveProviderUserContext({
      ...context,
      globalMemory: updatedMemory,
      lastSynthesis: now,
      nextSynthesis,
    });
  } catch (error) {
    console.warn("Profile synthesis failed", error);
    const now = new Date().toISOString();
    const nextSynthesis = new Date(Date.now() + SYNTHESIS_INTERVAL_MS).toISOString();

    return await saveProviderUserContext({
      ...context,
      lastSynthesis: now,
      nextSynthesis,
    });
  }
};

export const syncProviderTools = async (
  input: NormalizedProviderToolSyncInput,
  requestId?: string,
) => {
  const context = await loadOrCreateProviderUserContext({
    providerId: input.integration_id,
    userId: input.user_id,
  });

  const rateLimitedContext = enforceToolsSyncRateLimit({ context });

  const nextContext: ProviderUserContext = {
    ...rateLimitedContext,
    allowedTools: normalizeAllowedTools(input.tools),
  };

  await saveProviderUserContext(nextContext);

  logProviderAudit({
    event: "provider.tools.synced",
    requestId,
    providerId: input.integration_id,
    userId: input.user_id,
    status: "ok",
    metadata: {
      syncedTools: nextContext.allowedTools.length,
    },
  });

  return {
    integration_id: input.integration_id,
    user_id: input.user_id,
    synced_tools: nextContext.allowedTools.length,
    status: "ok",
  };
};

export const listProviderThreads = async ({
  providerId,
  userId,
}: {
  providerId: string;
  userId: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });

  return {
    threads: sortThreadsByRecency(context.threads).map((thread) => ({
      thread_id: thread.id,
      title: thread.title,
      is_private: thread.isTemporary,
      updated_at: thread.updatedAt,
    })),
  };
};

export const createProviderThread = async ({
  providerId,
  userId,
  title,
  isPrivate,
  channel,
  requestId,
}: {
  providerId: string;
  userId: string;
  title?: string;
  isPrivate?: boolean;
  channel: ProviderChannelInput;
  requestId?: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  const created = await createThreadForContext({
    context,
    isPrivate,
    channel,
  });

  if (title?.trim()) {
    const nextThreads = created.context.threads.map((thread) =>
      thread.id === created.threadId
        ? {
            ...thread,
            title: title.trim().slice(0, 80),
            isTitleEdited: true,
          }
        : thread,
    );
    const nextContext = {
      ...created.context,
      threads: nextThreads,
    };

    await saveProviderUserContext(nextContext);
  }

  logProviderAudit({
    event: "provider.thread.created",
    requestId,
    providerId,
    userId,
    threadId: created.threadId,
    channelType: channel.type,
    channelId: channel.id,
    status: "ok",
    metadata: {
      isPrivate: Boolean(isPrivate),
    },
  });

  return {
    thread_id: created.threadId,
    title: title?.trim() || getThreadTitleFromMessages(created.session.messages),
    is_private: Boolean(isPrivate),
    status: "ok",
  };
};

export const renameProviderThread = async ({
  providerId,
  userId,
  threadId,
  title,
  requestId,
}: {
  providerId: string;
  userId: string;
  threadId: string;
  title: string;
  requestId?: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  const nextTitle = title.trim().slice(0, 80);

  if (!nextTitle) {
    throw new Error("Thread title is required.");
  }

  const thread = context.threads.find((entry) => entry.id === threadId);

  if (!thread) {
    throw new Error("Thread not found.");
  }

  const nextContext: ProviderUserContext = {
    ...context,
    threads: context.threads.map((entry) =>
      entry.id === threadId
        ? {
            ...entry,
            title: nextTitle,
            isTitleEdited: true,
            updatedAt: new Date().toISOString(),
          }
        : entry,
    ),
    globalMemory: {
      ...context.globalMemory,
      threadSummaries: context.globalMemory.threadSummaries.map((summary) =>
        summary.threadId === threadId ? { ...summary, title: nextTitle } : summary,
      ),
      markdown: "",
    },
  };

  nextContext.globalMemory.markdown = buildGlobalMemoryMarkdown({
    memory: nextContext.globalMemory,
    threadSummaries: nextContext.globalMemory.threadSummaries,
  });

  await saveProviderUserContext(nextContext);

  logProviderAudit({
    event: "provider.thread.renamed",
    requestId,
    providerId,
    userId,
    threadId,
    status: "ok",
  });

  return {
    thread_id: threadId,
    title: nextTitle,
    status: "ok",
  };
};

export const deleteProviderThread = async ({
  providerId,
  userId,
  threadId,
  requestId,
}: {
  providerId: string;
  userId: string;
  threadId: string;
  requestId?: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  const thread = context.threads.find((entry) => entry.id === threadId);

  if (!thread) {
    throw new Error("Thread not found.");
  }

  await deleteChatSession(threadId);

  const nextContext: ProviderUserContext = {
    ...context,
    threads: context.threads.filter((entry) => entry.id !== threadId),
    globalMemory: pruneGlobalMemoryByThreadId(context.globalMemory, threadId),
    threadChannels: Object.fromEntries(
      Object.entries(context.threadChannels ?? {}).filter(
        ([entryThreadId]) => entryThreadId !== threadId,
      ),
    ),
    channels: Object.fromEntries(
      Object.entries(context.channels).map(([key, channel]) => [
        key,
        channel.lastActiveThreadId === threadId
          ? { ...channel, lastActiveThreadId: null }
          : channel,
      ]),
    ),
  };

  await saveProviderUserContext(nextContext);

  logProviderAudit({
    event: "provider.thread.deleted",
    requestId,
    providerId,
    userId,
    threadId,
    status: "ok",
  });

  return {
    thread_id: threadId,
    status: "ok",
  };
};

export const getProviderMemory = async ({
  providerId,
  userId,
}: {
  providerId: string;
  userId: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  return context.globalMemory;
};

export const getProviderThreadMemory = async ({
  providerId,
  userId,
  threadId,
}: {
  providerId: string;
  userId: string;
  threadId: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  const thread = context.threads.some((entry) => entry.id === threadId);

  if (!thread) {
    throw new Error("Thread not found.");
  }

  const session = await loadChatSession(threadId);
  return session.memory;
};

export const getProviderHydratedState = async ({
  providerId,
  userId,
  channel,
}: {
  providerId: string;
  userId: string;
  channel: ProviderChannelInput;
}) => {
  let context = await loadOrCreateProviderUserContext({ providerId, userId });
  const channelKey = buildChannelKey(channel);
  const channelState = context.channels[channelKey];

  let activeThreadId =
    channelState?.lastActiveThreadId || context.threads[0]?.id || null;

  if (!activeThreadId) {
    const created = await createThreadForContext({
      context,
      isPrivate: false,
      channel,
    });
    context = created.context;
    activeThreadId = created.threadId;
  }

  if (
    !context.channels[channelKey] ||
    context.channels[channelKey]?.lastActiveThreadId !== activeThreadId
  ) {
    context = await saveProviderUserContext({
      ...context,
      channels: {
        ...context.channels,
        [channelKey]: {
          type: channel.type,
          id: channel.id,
          lastActiveThreadId: activeThreadId,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }

  const threadSession = await loadChatSession(activeThreadId);

  return {
    activeThreadId,
    threads: context.threads,
    globalMemory: context.globalMemory,
    selectedModel: context.selectedModel,
    session: threadSession,
  };
};

export const isProviderRateLimitError = (
  error: unknown,
): error is ProviderRateLimitError => error instanceof ProviderRateLimitError;

export const handleProviderConversationInput = async ({
  input,
  providerConfig,
  requestId,
}: {
  input: NormalizedProviderConversationInput;
  providerConfig: ProviderConfig;
  requestId?: string;
}) => {
  const model = input.model?.trim() || DEFAULT_MODEL;
  const timeZone = getRequestTimeZone(input.timezone);
  let context = await loadOrCreateProviderUserContext({
    providerId: input.integration_id,
    userId: input.user_id,
  });
  const content = input.input.text.trim();

  if (!content) {
    throw new Error("Input text is required.");
  }

  context = enforceConversationRateLimit({ context });
  if (input.tools) {
    context = {
      ...context,
      allowedTools: normalizeAllowedTools(input.tools),
    };
  }
  context = await saveProviderUserContext(context);

  // --GROK--: Run personality/style synthesis before memory retrieval so the current
  // turn sees fresh results. Fires at most once per day (SYNTHESIS_INTERVAL_MS), or
  // immediately when the user explicitly asks for a behavioural/style calibration.
  if (
    context.threads.length > 0 &&
    (isSynthesisDue(context) || isCalibrationRequest(content))
  ) {
    context = await runProfileSynthesis({ context, timeZone, aiApiKey: providerConfig.aiApiKey });
  }

  logProviderAudit({
    event: "provider.conversation.received",
    requestId,
    providerId: input.integration_id,
    userId: input.user_id,
    threadId: input.thread_id,
    channelType: input.channel.type,
    channelId: input.channel.id,
    status: "ok",
  });

  let threadId = await resolveThreadId({
    context,
    providedThreadId: input.thread_id,
    channel: input.channel,
    content,
  });
  let currentContext = context;

  if (!threadId) {
    const created = await createThreadForContext({
      context,
      channel: input.channel,
      isPrivate: false,
    });

    threadId = created.threadId;
    currentContext = created.context;
  }

  const thread = currentContext.threads.find((entry) => entry.id === threadId);

  if (!thread) {
    throw new Error("Thread not found.");
  }

  const currentState = await loadChatSession(threadId);
  const memoryScope = selectProviderGlobalMemory({
    memoryPolicy: currentContext.memoryPolicy,
    globalMemory: currentContext.globalMemory,
    isPrivate: thread.isTemporary,
  });
  const memoryBackend = createMemoryBackend();
  const memoryContext =
    currentContext.memoryPolicy.mode === "external"
      ? input.context?.external_memories?.join("\n") || null
      : await memoryBackend.retrieve({
          userId: input.user_id ?? "",
          integrationId: input.integration_id ?? "",
          threadId,
          userMessage: content,
          messages: currentState.messages,
          threadMemory: currentState.memory,
          globalMemory: memoryScope,
          policy: currentContext.memoryPolicy,
          timeZone,
          aiApiKey: providerConfig.aiApiKey,
        });
  const nextState = await appendMessagesToThread({
    threadId,
    messages: [createUserMessage(content)],
  });

  let assistantContent = "";
  let action:
    | "direct_reply"
    | "clarification"
    | "tool_call"
    | "command" = "direct_reply";
  let executionState: ProviderExecutionState | undefined;
  let executionId: string | undefined;
  let pendingToolConfirmation: PendingToolConfirmation | null = null;
  let decisionReasoning: string | null = null;
  const shortcutInvocation = parseToolShortcutInvocation({
    content,
    tools: currentContext.allowedTools,
  });
  const shortcutInvocations = parseToolShortcutInvocations({
    content,
    tools: currentContext.allowedTools,
  });

  if (shortcutInvocation) {
    const lastShortcutInvocation = shortcutInvocations.at(-1) ?? shortcutInvocation;
    const executableShortcuts = shortcutInvocations.filter((entry) => entry.remainder);

    if (executableShortcuts.length > 0) {
      const executionMessages = [];

      for (const entry of executableShortcuts) {
        const execution = await executeProviderTool({
          providerConfig,
          providerId: input.integration_id,
          userId: input.user_id,
          threadId,
          toolName: entry.tool.toolName,
          args: buildShortcutToolArguments({
            tool: entry.tool,
            content: entry.remainder,
          }),
          channel: input.channel,
          rawInputText: buildShortcutRawInputText({
            tool: entry.tool,
            content: entry.remainder,
          }),
          shortcutMode: true,
          requestId,
        });

        executionMessages.push(execution.message);
        action = "tool_call";
        executionState = execution.state;
        executionId = execution.executionId;

        logProviderAudit({
          event: "provider.tool.executed",
          requestId,
          providerId: input.integration_id,
          userId: input.user_id,
          threadId,
          status: execution.state === "failed" ? "error" : "ok",
          metadata: {
            toolName: entry.tool.toolName,
            executionState: execution.state,
            viaShortcut: true,
          },
        });
      }

      assistantContent = executionMessages.join("\n");
    } else {
      assistantContent = `Tool shortcut detected for ${lastShortcutInvocation.tool.toolName}. Include the payload in the same message, for example \`@${lastShortcutInvocation.tool.toolName} hello\`.`;
      action = "clarification";
      executionState = "needs_clarification";
    }
  } else if (currentState.pendingToolConfirmation) {
    const pendingTool = currentContext.allowedTools.find(
      (tool) => tool.toolName === currentState.pendingToolConfirmation?.toolName,
    );

    if (
      currentState.pendingToolConfirmation.mode === "confirmation" ||
      !pendingTool
    ) {
      const pendingReply = interpretPendingToolConfirmation(content);

      if (pendingReply === "confirm") {
        const execution = await executeProviderTool({
          providerConfig,
          providerId: input.integration_id,
          userId: input.user_id,
          threadId,
          toolName: currentState.pendingToolConfirmation.toolName,
          args: currentState.pendingToolConfirmation.arguments,
          executorPayloadTemplate: pendingTool?.executorPayload,
          channel: input.channel,
          rawInputText: currentState.pendingToolConfirmation.rawInputText,
          requestId,
        });

        assistantContent = execution.message;
        action = "tool_call";
        executionState = execution.state;
        executionId = execution.executionId;

        logProviderAudit({
          event: "provider.tool.executed",
          requestId,
          providerId: input.integration_id,
          userId: input.user_id,
          threadId,
          status: execution.state === "failed" ? "error" : "ok",
          metadata: {
            toolName: currentState.pendingToolConfirmation.toolName,
            executionState: execution.state,
            viaConfirmation: true,
          },
        });
      } else if (pendingReply === "reject") {
        assistantContent =
          "Okay, I will not use that tool. Tell me what you want me to do instead.";
        action = "clarification";
        executionState = "needs_clarification";
      } else {
        assistantContent = buildPendingConfirmationReminder({
          tool: pendingTool,
        });
        action = "clarification";
        executionState = "needs_clarification";
        pendingToolConfirmation = currentState.pendingToolConfirmation;
      }
    } else {
      const updated = await updatePendingToolArguments({
        tool: pendingTool,
        currentArguments: currentState.pendingToolConfirmation.arguments,
        userReply: content,
        question: currentState.pendingToolConfirmation.question,
        timeZone,
        aiApiKey: providerConfig.aiApiKey,
      });

      if (updated.followUp) {
        assistantContent = updated.followUp;
        action = "clarification";
        executionState = "needs_clarification";
        const pendingRawFieldName = getRawToolStringFieldName(pendingTool);
        const updatedRawInputText =
          getToolInputMode(pendingTool) === "raw"
            ? pendingRawFieldName && typeof updated.arguments[pendingRawFieldName] === "string"
              ? (updated.arguments[pendingRawFieldName] as string)
              : undefined
            : currentState.pendingToolConfirmation.rawInputText;
        pendingToolConfirmation = {
          ...currentState.pendingToolConfirmation,
          mode: "follow_up",
          arguments: updated.arguments,
          rawInputText: updatedRawInputText ?? currentState.pendingToolConfirmation.rawInputText,
          question: updated.followUp,
        };
      } else {
        const pendingRawFieldName = getRawToolStringFieldName(pendingTool);
        const updatedRawInputText =
          getToolInputMode(pendingTool) === "raw"
            ? pendingRawFieldName && typeof updated.arguments[pendingRawFieldName] === "string"
              ? (updated.arguments[pendingRawFieldName] as string)
              : undefined
            : currentState.pendingToolConfirmation.rawInputText;
        const execution = await executeProviderTool({
          providerConfig,
          providerId: input.integration_id,
          userId: input.user_id,
          threadId,
          toolName: currentState.pendingToolConfirmation.toolName,
          args: updated.arguments,
          channel: input.channel,
          rawInputText: updatedRawInputText ?? currentState.pendingToolConfirmation.rawInputText,
          requestId,
        });

        assistantContent = execution.message;
        action = "tool_call";
        executionState = execution.state;
        executionId = execution.executionId;

        logProviderAudit({
          event: "provider.tool.executed",
          requestId,
          providerId: input.integration_id,
          userId: input.user_id,
          threadId,
          status: execution.state === "failed" ? "error" : "ok",
          metadata: {
            toolName: currentState.pendingToolConfirmation.toolName,
            executionState: execution.state,
            viaFollowUp: true,
          },
        });
      }
    }
  } else {
    const decision = await decideConversationAction({
      content,
      messages: currentState.messages,
      memoryContext,
      tools: currentContext.allowedTools,
      replyModel: model,
      timeZone,
      aiApiKey: providerConfig.aiApiKey,
    });
    decisionReasoning = decision.reasoning ?? null;

    if (decision.action === "direct_reply") {
      assistantContent = decision.reply;
      action = "direct_reply";
    } else if (decision.action === "clarification") {
      assistantContent = decision.question;
      action = "clarification";
      executionState = "needs_clarification";
    } else if (decision.action === "tool_follow_up") {
      const confidence = clampDecisionConfidence(decision.confidence);
      const tool = currentContext.allowedTools.find(
        (entry) => entry.toolName === decision.tool_name,
      );
      const normalizedInput = normalizeToolExecutionInput({
        tool,
        args: decision.arguments,
        content,
      });

      assistantContent = decision.question;
      action = "clarification";
      executionState = "needs_clarification";
      pendingToolConfirmation = {
        mode: "follow_up",
        toolName: decision.tool_name,
        arguments: normalizedInput.arguments,
        rawInputText: normalizedInput.rawInputText,
        confidence,
        createdAt: new Date().toISOString(),
        question: decision.question,
      };
    } else {
      const confidence = clampDecisionConfidence(decision.confidence);
      const tool = currentContext.allowedTools.find(
        (entry) => entry.toolName === decision.tool_name,
      );
      const normalizedInput = normalizeToolExecutionInput({
        tool,
        args: decision.arguments,
        content,
      });
      const confidenceAction = getToolDecisionConfidenceAction(confidence);

      if (confidenceAction === "clarify") {
        assistantContent = buildLowConfidenceToolQuestion();
        action = "clarification";
        executionState = "needs_clarification";
      } else if (confidenceAction === "confirm") {
        assistantContent = buildToolConfirmationQuestion({
          tool,
        });
        action = "clarification";
        executionState = "needs_clarification";
        pendingToolConfirmation = {
          mode: "confirmation",
          toolName: decision.tool_name,
          arguments: normalizedInput.arguments,
          rawInputText: normalizedInput.rawInputText,
          confidence,
          createdAt: new Date().toISOString(),
        };
      } else {
        const execution = await executeProviderTool({
          providerConfig,
          providerId: input.integration_id,
          userId: input.user_id,
          threadId,
          toolName: decision.tool_name,
          args: normalizedInput.arguments,
          executorPayloadTemplate: tool?.executorPayload,
          channel: input.channel,
          rawInputText: normalizedInput.rawInputText,
          requestId,
        });

        assistantContent = execution.message;
        action = "tool_call";
        executionState = execution.state;
        executionId = execution.executionId;

        logProviderAudit({
          event: "provider.tool.executed",
          requestId,
          providerId: input.integration_id,
          userId: input.user_id,
          threadId,
          status: execution.state === "failed" ? "error" : "ok",
          metadata: {
            toolName: decision.tool_name,
            executionState: execution.state,
            confidence,
          },
        });
      }
    }
  }

  const withAssistant = await appendMessagesToThread({
    threadId,
    messages: [createAssistantMessage(assistantContent)],
    pendingToolConfirmation,
  });

  const finalContext = await saveProviderUserContext({
    ...currentContext,
    selectedModel: model,
    threads: updateThreadSummaries(
      currentContext.threads,
      buildThreadSummary(thread, withAssistant.messages),
    ),
    channels: updateChannelState({
      context: currentContext,
      channel: input.channel,
      threadId,
    }),
    threadChannels: updateThreadChannelState({
      context: currentContext,
      channel: input.channel,
      threadId,
    }),
  });

  scheduleBackgroundTask(
    refreshProviderMemories({
      threadId,
      state: withAssistant,
      thread:
        finalContext.threads.find((entry) => entry.id === threadId) ?? thread,
      context: finalContext,
      isPrivate: thread.isTemporary,
      timeZone,
      aiApiKey: providerConfig.aiApiKey,
    }).then(() => undefined),
  );

  logProviderAudit({
    event: "provider.conversation.completed",
    requestId,
    providerId: input.integration_id,
    userId: input.user_id,
    threadId,
    channelType: input.channel.type,
    channelId: input.channel.id,
    status: "ok",
    metadata: {
      action,
      executionState: executionState ?? null,
    },
  });

  return {
    integration_id: input.integration_id,
    user_id: input.user_id,
    thread_id: threadId,
    response: {
      type: getConversationResponseKind({
        action,
        executionState,
        pendingToolConfirmation,
      }),
      content: assistantContent,
      reasoning: decisionReasoning,
      task_status:
        executionState ?? (action === "tool_call" ? "completed" : null),
    },
    execution:
      executionState || executionId
        ? {
            state: executionState ?? null,
            execution_id: executionId ?? null,
          }
        : null,
    model: model || finalContext.selectedModel,
  };
};

export const handleStreamConversationInput = async ({
  input,
  providerConfig,
  requestId,
}: {
  input: NormalizedProviderConversationInput;
  providerConfig: ProviderConfig;
  requestId?: string;
}) => {
  const model = input.model?.trim() || DEFAULT_MODEL;
  const timeZone = getRequestTimeZone(input.timezone);
  let context = await loadOrCreateProviderUserContext({
    providerId: input.integration_id,
    userId: input.user_id,
  });
  const content = input.input.text.trim();

  if (!content) {
    throw new Error("Input text is required.");
  }

  context = enforceConversationRateLimit({ context });
  if (input.tools) {
    context = {
      ...context,
      allowedTools: normalizeAllowedTools(input.tools),
    };
  }
  context = await saveProviderUserContext(context);

  if (
    context.threads.length > 0 &&
    (isSynthesisDue(context) || isCalibrationRequest(content))
  ) {
    context = await runProfileSynthesis({ context, timeZone, aiApiKey: providerConfig.aiApiKey });
  }

  logProviderAudit({
    event: "provider.conversation.received",
    requestId,
    providerId: input.integration_id,
    userId: input.user_id,
    threadId: input.thread_id,
    channelType: input.channel.type,
    channelId: input.channel.id,
    status: "ok",
  });

  let threadId = await resolveThreadId({
    context,
    providedThreadId: input.thread_id,
    channel: input.channel,
    content,
  });
  let currentContext = context;

  if (!threadId) {
    const created = await createThreadForContext({
      context,
      channel: input.channel,
      isPrivate: false,
    });

    threadId = created.threadId;
    currentContext = created.context;
  }

  const thread = currentContext.threads.find((entry) => entry.id === threadId);

  if (!thread) {
    throw new Error("Thread not found.");
  }

  const currentState = await loadChatSession(threadId);
  const memoryScope = selectProviderGlobalMemory({
    memoryPolicy: currentContext.memoryPolicy,
    globalMemory: currentContext.globalMemory,
    isPrivate: thread.isTemporary,
  });
  const memoryBackend = createMemoryBackend();
  const memoryContext =
    currentContext.memoryPolicy.mode === "external"
      ? input.context?.external_memories?.join("\n") || null
      : await memoryBackend.retrieve({
          userId: input.user_id ?? "",
          integrationId: input.integration_id ?? "",
          threadId,
          userMessage: content,
          messages: currentState.messages,
          threadMemory: currentState.memory,
          globalMemory: memoryScope,
          policy: currentContext.memoryPolicy,
          timeZone,
          aiApiKey: providerConfig.aiApiKey,
        });

  await appendMessagesToThread({
    threadId,
    messages: [createUserMessage(content)],
  });

  let action:
    | "direct_reply"
    | "clarification"
    | "tool_call"
    | "command" = "direct_reply";
  let executionState: ProviderExecutionState | undefined;
  let executionId: string | undefined;
  let pendingToolConfirmation: PendingToolConfirmation | null = null;
  let decisionReasoning: string | null = null;
  let streamDecision: ConversationDecision | null = null;

  const shortcutInvocation = parseToolShortcutInvocation({
    content,
    tools: currentContext.allowedTools,
  });
  const shortcutInvocations = parseToolShortcutInvocations({
    content,
    tools: currentContext.allowedTools,
  });

  let preComputedContent = "";
  let preComputedAction: "direct_reply" | "clarification" | "tool_call" | "command" = action;
  let preComputedExecutionState: ProviderExecutionState | undefined = executionState;
  let preComputedExecutionId: string | undefined = executionId;
  let preComputedPendingToolConfirmation: PendingToolConfirmation | null = pendingToolConfirmation;

  if (shortcutInvocation) {
    const lastShortcutInvocation = shortcutInvocations.at(-1) ?? shortcutInvocation;
    const executableShortcuts = shortcutInvocations.filter((entry) => entry.remainder);

    if (executableShortcuts.length > 0) {
      const executionMessages = [];

      for (const entry of executableShortcuts) {
        const execution = await executeProviderTool({
          providerConfig,
          providerId: input.integration_id,
          userId: input.user_id,
          threadId,
          toolName: entry.tool.toolName,
          args: buildShortcutToolArguments({
            tool: entry.tool,
            content: entry.remainder,
          }),
          channel: input.channel,
          rawInputText: buildShortcutRawInputText({
            tool: entry.tool,
            content: entry.remainder,
          }),
          shortcutMode: true,
          requestId,
        });

        executionMessages.push(execution.message);
        preComputedAction = "tool_call";
        preComputedExecutionState = execution.state;
        preComputedExecutionId = execution.executionId;

        logProviderAudit({
          event: "provider.tool.executed",
          requestId,
          providerId: input.integration_id,
          userId: input.user_id,
          threadId,
          status: execution.state === "failed" ? "error" : "ok",
          metadata: {
            toolName: entry.tool.toolName,
            executionState: execution.state,
            viaShortcut: true,
          },
        });
      }

      preComputedContent = executionMessages.join("\n");
    } else {
      preComputedContent = `Tool shortcut detected for ${lastShortcutInvocation.tool.toolName}. Include the payload in the same message, for example \`@${lastShortcutInvocation.tool.toolName} hello\`.`;
      preComputedAction = "clarification";
      preComputedExecutionState = "needs_clarification";
    }
  } else if (currentState.pendingToolConfirmation) {
    const pendingTool = currentContext.allowedTools.find(
      (tool) => tool.toolName === currentState.pendingToolConfirmation?.toolName,
    );

    if (
      currentState.pendingToolConfirmation.mode === "confirmation" ||
      !pendingTool
    ) {
      const pendingReply = interpretPendingToolConfirmation(content);

      if (pendingReply === "confirm") {
        const execution = await executeProviderTool({
          providerConfig,
          providerId: input.integration_id,
          userId: input.user_id,
          threadId,
          toolName: currentState.pendingToolConfirmation.toolName,
          args: currentState.pendingToolConfirmation.arguments,
          executorPayloadTemplate: pendingTool?.executorPayload,
          channel: input.channel,
          rawInputText: currentState.pendingToolConfirmation.rawInputText,
          requestId,
        });

        preComputedContent = execution.message;
        preComputedAction = "tool_call";
        preComputedExecutionState = execution.state;
        preComputedExecutionId = execution.executionId;

        logProviderAudit({
          event: "provider.tool.executed",
          requestId,
          providerId: input.integration_id,
          userId: input.user_id,
          threadId,
          status: execution.state === "failed" ? "error" : "ok",
          metadata: {
            toolName: currentState.pendingToolConfirmation.toolName,
            executionState: execution.state,
            viaConfirmation: true,
          },
        });
      } else if (pendingReply === "reject") {
        preComputedContent =
          "Okay, I will not use that tool. Tell me what you want me to do instead.";
        preComputedAction = "clarification";
        preComputedExecutionState = "needs_clarification";
      } else {
        preComputedContent = buildPendingConfirmationReminder({
          tool: pendingTool,
        });
        preComputedAction = "clarification";
        preComputedExecutionState = "needs_clarification";
        preComputedPendingToolConfirmation = currentState.pendingToolConfirmation;
      }
    } else {
      const updated = await updatePendingToolArguments({
        tool: pendingTool,
        currentArguments: currentState.pendingToolConfirmation.arguments,
        userReply: content,
        question: currentState.pendingToolConfirmation.question,
        timeZone,
        aiApiKey: providerConfig.aiApiKey,
      });

      if (updated.followUp) {
        preComputedContent = updated.followUp;
        preComputedAction = "clarification";
        preComputedExecutionState = "needs_clarification";
        const pendingRawFieldName = getRawToolStringFieldName(pendingTool);
        const updatedRawInputText =
          getToolInputMode(pendingTool) === "raw"
            ? pendingRawFieldName && typeof updated.arguments[pendingRawFieldName] === "string"
              ? (updated.arguments[pendingRawFieldName] as string)
              : undefined
            : currentState.pendingToolConfirmation.rawInputText;
        preComputedPendingToolConfirmation = {
          ...currentState.pendingToolConfirmation,
          mode: "follow_up",
          arguments: updated.arguments,
          rawInputText: updatedRawInputText ?? currentState.pendingToolConfirmation.rawInputText,
          question: updated.followUp,
        };
      } else {
        const pendingRawFieldName = getRawToolStringFieldName(pendingTool);
        const updatedRawInputText =
          getToolInputMode(pendingTool) === "raw"
            ? pendingRawFieldName && typeof updated.arguments[pendingRawFieldName] === "string"
              ? (updated.arguments[pendingRawFieldName] as string)
              : undefined
            : currentState.pendingToolConfirmation.rawInputText;
        const execution = await executeProviderTool({
          providerConfig,
          providerId: input.integration_id,
          userId: input.user_id,
          threadId,
          toolName: currentState.pendingToolConfirmation.toolName,
          args: updated.arguments,
          channel: input.channel,
          rawInputText: updatedRawInputText ?? currentState.pendingToolConfirmation.rawInputText,
          requestId,
        });

        preComputedContent = execution.message;
        preComputedAction = "tool_call";
        preComputedExecutionState = execution.state;
        preComputedExecutionId = execution.executionId;

        logProviderAudit({
          event: "provider.tool.executed",
          requestId,
          providerId: input.integration_id,
          userId: input.user_id,
          threadId,
          status: execution.state === "failed" ? "error" : "ok",
          metadata: {
            toolName: currentState.pendingToolConfirmation.toolName,
            executionState: execution.state,
            viaFollowUp: true,
          },
        });
      }
    }
  } else {
    const decision = await decideConversationAction({
      content,
      messages: currentState.messages,
      memoryContext,
      tools: currentContext.allowedTools,
      replyModel: model,
      timeZone,
      aiApiKey: providerConfig.aiApiKey,
      generateReply: false,
    });
    decisionReasoning = decision.reasoning ?? null;
    streamDecision = decision;
  }

  const isPrecomputed = !streamDecision;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ event, ...data })}\n\n`),
        );
      };

      try {
        let assistantContent = preComputedContent;
        let finalAction: "direct_reply" | "clarification" | "tool_call" | "command" = preComputedAction;
        let finalExecutionState: ProviderExecutionState | undefined = preComputedExecutionState;
        let finalExecutionId: string | undefined = preComputedExecutionId;
        let finalPendingToolConfirmation: PendingToolConfirmation | null = preComputedPendingToolConfirmation;

        if (isPrecomputed) {
          send("decision", {
            action: finalAction,
            reasoning: decisionReasoning,
          });
        } else if (streamDecision?.action === "direct_reply") {
          send("decision", {
            action: "direct_reply",
            reasoning: decisionReasoning,
          });

          let streamedContent = "";
          for await (const chunk of buildDirectReplyStream({
            content,
            messages: currentState.messages,
            memoryContext,
            replyModel: model,
            timeZone,
            aiApiKey: providerConfig.aiApiKey,
          })) {
            streamedContent += chunk;
            send("delta", { content: chunk });
          }

          assistantContent = streamedContent;
          finalAction = "direct_reply";
        } else if (streamDecision?.action === "clarification") {
          assistantContent = streamDecision.question;
          finalAction = "clarification";
          finalExecutionState = "needs_clarification";
          send("decision", {
            action: "clarification",
            reasoning: decisionReasoning,
          });
        } else if (streamDecision?.action === "tool_follow_up") {
          const confidence = clampDecisionConfidence(streamDecision.confidence);
          const tool = currentContext.allowedTools.find(
            (entry) => entry.toolName === streamDecision.tool_name,
          );
          const normalizedInput = normalizeToolExecutionInput({
            tool,
            args: streamDecision.arguments,
            content,
          });

          assistantContent = streamDecision.question;
          finalAction = "clarification";
          finalExecutionState = "needs_clarification";
          finalPendingToolConfirmation = {
            mode: "follow_up",
            toolName: streamDecision.tool_name,
            arguments: normalizedInput.arguments,
            rawInputText: normalizedInput.rawInputText,
            confidence,
            createdAt: new Date().toISOString(),
            question: streamDecision.question,
          };
          send("decision", {
            action: "clarification",
            reasoning: decisionReasoning,
          });
        } else if (streamDecision?.action === "tool_call") {
          const confidence = clampDecisionConfidence(streamDecision.confidence);
          const tool = currentContext.allowedTools.find(
            (entry) => entry.toolName === streamDecision.tool_name,
          );
          const normalizedInput = normalizeToolExecutionInput({
            tool,
            args: streamDecision.arguments,
            content,
          });
          const confidenceAction = getToolDecisionConfidenceAction(confidence);

          if (confidenceAction === "clarify") {
            assistantContent = buildLowConfidenceToolQuestion();
            finalAction = "clarification";
            finalExecutionState = "needs_clarification";
            send("decision", {
              action: "clarification",
              reasoning: decisionReasoning,
            });
          } else if (confidenceAction === "confirm") {
            assistantContent = buildToolConfirmationQuestion({ tool });
            finalAction = "clarification";
            finalExecutionState = "needs_clarification";
            finalPendingToolConfirmation = {
              mode: "confirmation",
              toolName: streamDecision.tool_name,
              arguments: normalizedInput.arguments,
              rawInputText: normalizedInput.rawInputText,
              confidence,
              createdAt: new Date().toISOString(),
            };
            send("decision", {
              action: "clarification",
              reasoning: decisionReasoning,
            });
          } else {
            const execution = await executeProviderTool({
              providerConfig,
              providerId: input.integration_id,
              userId: input.user_id,
              threadId,
              toolName: streamDecision.tool_name,
              args: normalizedInput.arguments,
              executorPayloadTemplate: tool?.executorPayload,
              channel: input.channel,
              rawInputText: normalizedInput.rawInputText,
              requestId,
            });

            assistantContent = execution.message;
            finalAction = "tool_call";
            finalExecutionState = execution.state;
            finalExecutionId = execution.executionId;

            logProviderAudit({
              event: "provider.tool.executed",
              requestId,
              providerId: input.integration_id,
              userId: input.user_id,
              threadId,
              status: execution.state === "failed" ? "error" : "ok",
              metadata: {
                toolName: streamDecision.tool_name,
                executionState: execution.state,
                confidence,
              },
            });

            send("decision", {
              action: "tool_call",
              reasoning: decisionReasoning,
            });
          }
        }

        const withAssistant = await appendMessagesToThread({
          threadId,
          messages: [createAssistantMessage(assistantContent)],
          pendingToolConfirmation: finalPendingToolConfirmation,
        });

        const finalContext = await saveProviderUserContext({
          ...currentContext,
          selectedModel: model,
          threads: updateThreadSummaries(
            currentContext.threads,
            buildThreadSummary(thread, withAssistant.messages),
          ),
          channels: updateChannelState({
            context: currentContext,
            channel: input.channel,
            threadId,
          }),
          threadChannels: updateThreadChannelState({
            context: currentContext,
            channel: input.channel,
            threadId,
          }),
        });

        scheduleBackgroundTask(
          refreshProviderMemories({
            threadId,
            state: withAssistant,
            thread:
              finalContext.threads.find((entry) => entry.id === threadId) ?? thread,
            context: finalContext,
            isPrivate: thread.isTemporary,
            timeZone,
            aiApiKey: providerConfig.aiApiKey,
          }).then(() => undefined),
        );

        logProviderAudit({
          event: "provider.conversation.completed",
          requestId,
          providerId: input.integration_id,
          userId: input.user_id,
          threadId,
          channelType: input.channel.type,
          channelId: input.channel.id,
          status: "ok",
          metadata: {
            action: finalAction,
            executionState: finalExecutionState ?? null,
          },
        });

        send("done", {
          thread_id: threadId,
          messages: withAssistant.messages.map((m) => ({
            message_id: m.id,
            role: m.role,
            content: m.content,
            created_at: m.createdAt,
          })),
          action: finalAction,
          execution:
            finalExecutionState || finalExecutionId
              ? {
                  state: finalExecutionState ?? null,
                  execution_id: finalExecutionId ?? null,
                }
              : null,
          model,
        });

        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Stream error.";
        send("error", { code: "internal_error", message });
        controller.close();
      }
    },
  });

  return { stream, threadId };
};

export const simulateConversationInput = async ({
  input,
  providerConfig,
  requestId,
}: {
  input: NormalizedProviderConversationInput;
  providerConfig: ProviderConfig;
  requestId?: string;
}) => {
  const model = input.model?.trim() || DEFAULT_MODEL;
  const timeZone = getRequestTimeZone(input.timezone);
  const context = await loadOrCreateProviderUserContext({
    providerId: input.integration_id,
    userId: input.user_id,
  });
  const content = input.input.text.trim();

  if (!content) {
    throw new Error("Input text is required.");
  }

  const threadId = await resolveThreadId({
    context,
    providedThreadId: input.thread_id,
    channel: input.channel,
    content,
  });

  if (!threadId) {
    throw new Error("No thread found or created for simulation.");
  }

  const thread = context.threads.find((entry) => entry.id === threadId);

  if (!thread) {
    throw new Error("Thread not found.");
  }

  const currentState = await loadChatSession(threadId);
  const memoryScope = selectProviderGlobalMemory({
    memoryPolicy: context.memoryPolicy,
    globalMemory: context.globalMemory,
    isPrivate: thread.isTemporary,
  });
  const memoryBackend = createMemoryBackend();
  const memoryContext =
    context.memoryPolicy.mode === "external"
      ? input.context?.external_memories?.join("\n") || null
      : await memoryBackend.retrieve({
          userId: input.user_id ?? "",
          integrationId: input.integration_id ?? "",
          threadId,
          userMessage: content,
          messages: currentState.messages,
          threadMemory: currentState.memory,
          globalMemory: memoryScope,
          policy: context.memoryPolicy,
          timeZone,
          aiApiKey: providerConfig.aiApiKey,
        });

  const decision = await decideConversationAction({
    content,
    messages: currentState.messages,
    memoryContext,
    tools: context.allowedTools,
    replyModel: model,
    timeZone,
    aiApiKey: providerConfig.aiApiKey,
  });

  let assistantContent = "";
  let action: "direct_reply" | "clarification" | "tool_call" | "command" = "direct_reply";
  let executionState: ProviderExecutionState | undefined;
  let decisionReasoning: string | null = null;
  let pendingToolConfirmation: PendingToolConfirmation | null = null;

  if (decision.action === "direct_reply") {
    assistantContent = decision.reply;
    action = "direct_reply";
    decisionReasoning = decision.reasoning ?? null;
  } else if (decision.action === "clarification") {
    assistantContent = decision.question;
    action = "clarification";
    executionState = "needs_clarification";
    decisionReasoning = decision.reasoning ?? null;
  } else if (decision.action === "tool_follow_up") {
    const confidence = clampDecisionConfidence(decision.confidence);
    const tool = context.allowedTools.find(
      (entry) => entry.toolName === decision.tool_name,
    );
    const normalizedInput = normalizeToolExecutionInput({
      tool,
      args: decision.arguments,
      content,
    });
    assistantContent = decision.question;
    action = "clarification";
    executionState = "needs_clarification";
    decisionReasoning = decision.reasoning ?? null;
    pendingToolConfirmation = {
      mode: "follow_up",
      toolName: decision.tool_name,
      arguments: normalizedInput.arguments,
      rawInputText: normalizedInput.rawInputText,
      confidence,
      createdAt: new Date().toISOString(),
      question: decision.question,
    };
  } else {
    const confidence = clampDecisionConfidence(decision.confidence);
    const tool = context.allowedTools.find(
      (entry) => entry.toolName === decision.tool_name,
    );
    const normalizedInput = normalizeToolExecutionInput({
      tool,
      args: decision.arguments,
      content,
    });
    const confidenceAction = getToolDecisionConfidenceAction(confidence);

    if (confidenceAction === "clarify") {
      assistantContent = buildLowConfidenceToolQuestion();
      action = "clarification";
      executionState = "needs_clarification";
      decisionReasoning = decision.reasoning ?? null;
    } else if (confidenceAction === "confirm") {
      assistantContent = buildToolConfirmationQuestion({ tool });
      action = "clarification";
      executionState = "needs_clarification";
      decisionReasoning = decision.reasoning ?? null;
      pendingToolConfirmation = {
        mode: "confirmation",
        toolName: decision.tool_name,
        arguments: normalizedInput.arguments,
        rawInputText: normalizedInput.rawInputText,
        confidence,
        createdAt: new Date().toISOString(),
      };
    } else {
      assistantContent = `[Simulated] Would execute ${decision.tool_name} with arguments: ${JSON.stringify(normalizedInput.arguments)}`;
      action = "tool_call";
      executionState = "simulated" as ProviderExecutionState;
      decisionReasoning = decision.reasoning ?? null;
    }
  }

  return {
    integration_id: input.integration_id,
    user_id: input.user_id,
    thread_id: threadId,
    simulated: true,
    response: {
      type: getConversationResponseKind({
        action,
        executionState,
        pendingToolConfirmation,
      }),
      content: assistantContent,
      reasoning: decisionReasoning,
      task_status:
        executionState ?? (action === "tool_call" ? "completed" : null),
    },
    execution:
      executionState || action === "tool_call"
        ? {
            state: executionState ?? null,
            execution_id: null,
          }
        : null,
    model,
  };
};

export const handleProviderExecutorResult = async ({
  input,
  providerConfig,
  requestId,
}: {
  input: NormalizedProviderExecutorResultInput;
  providerConfig: ProviderConfig;
  requestId?: string;
}) => {
  const content = input.result.content.trim();

  if (!content) {
    throw new Error("Executor result content is required.");
  }

  const context = await loadOrCreateProviderUserContext({
    providerId: input.integration_id,
    userId: input.user_id,
  });
  const thread = context.threads.find((entry) => entry.id === input.thread_id);

  if (!thread) {
    throw new Error("Thread not found.");
  }

  const channel =
    input.channel ??
    context.threadChannels?.[input.thread_id] ??
    Object.values(context.channels).find(
      (entry) => entry.lastActiveThreadId === input.thread_id,
    );

  const withAssistant = await appendMessagesToThread({
    threadId: input.thread_id,
    messages: [createAssistantMessage(content)],
  });

  const nextContext = await saveProviderUserContext({
    ...context,
    threads: updateThreadSummaries(
      context.threads,
      buildThreadSummary(thread, withAssistant.messages),
    ),
    ...(channel
      ? {
          channels: updateChannelState({
            context,
            channel,
            threadId: input.thread_id,
          }),
          threadChannels: updateThreadChannelState({
            context,
            channel,
            threadId: input.thread_id,
          }),
        }
      : {}),
  });

  scheduleBackgroundTask(
    refreshProviderMemories({
      threadId: input.thread_id,
      state: withAssistant,
      thread:
        nextContext.threads.find((entry) => entry.id === input.thread_id) ?? thread,
      context: nextContext,
      isPrivate: thread.isTemporary,
      timeZone: null,
      aiApiKey: providerConfig.aiApiKey,
    }).then(() => undefined),
  );

  let channelDelivery: "sent" | "skipped" | "failed" = "skipped";

  if (channel) {
    try {
      const delivered = await sendProviderChannelMessage({
        providerConfig,
        providerId: input.integration_id,
        userId: input.user_id,
        threadId: input.thread_id,
        channel,
        content,
        task: {
          executionId: input.result.execution_id,
          toolName: input.result.tool_name,
          state: input.result.state,
          data: input.result.data,
        },
        requestId,
      });
      channelDelivery = delivered ? "sent" : "failed";
    } catch {
      channelDelivery = "failed";
    }
  }

  logProviderAudit({
    event: "provider.executor_result.received",
    requestId,
    providerId: input.integration_id,
    userId: input.user_id,
    threadId: input.thread_id,
    channelType: channel?.type,
    channelId: channel?.id,
    status: channelDelivery === "failed" ? "error" : "ok",
    metadata: {
      toolName: input.result.tool_name ?? null,
      executionState: input.result.state,
      channelDelivery,
    },
  });

  return {
    integration_id: input.integration_id,
    user_id: input.user_id,
    thread_id: input.thread_id,
    status: "ok",
    channel_delivery: channelDelivery,
  };
};

export const getProviderHealth = async ({
  providerId,
  userId,
  providerConfig,
}: {
  providerId: string;
  userId: string;
  providerConfig: ProviderConfig;
}) => {
  const context = await loadOrCreateProviderUserContext({
    providerId,
    userId,
  });

  const activeTools = context.allowedTools.filter(
    (tool) => tool.status === "active",
  );

  const recentEvents = context.auditLog ?? [];
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const last24h = recentEvents.filter((e) => e.at >= cutoff);

  const toolExecutionFailures = last24h.filter(
    (e) =>
      e.event === "provider.tool.executed" && e.status === "error",
  ).length;

  const deliveryFailures = last24h.filter(
    (e) =>
      e.event === "provider.executor_result.received" && e.status === "error",
  ).length;

  const recentCallbacks = last24h.filter(
    (e) => e.event === "provider.executor_result.received",
  ).length;

  const overall =
    toolExecutionFailures > 3 || deliveryFailures > 3
      ? "degraded"
      : toolExecutionFailures > 0 || deliveryFailures > 0
        ? "warning"
        : "healthy";

  return {
    integration: {
      id: providerId,
      configured: true,
    },
    executor: {
      base_url_configured: !!providerConfig.baseUrl,
      recent_failures: toolExecutionFailures,
    },
    tools: {
      count: context.allowedTools.length,
      active: activeTools.length,
    },
    callbacks: {
      recent_activity: recentCallbacks > 0,
      recent_count: recentCallbacks,
    },
    delivery: {
      recent_failures: deliveryFailures,
    },
    overall,
  };
};
