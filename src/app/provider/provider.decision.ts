import { buildPromptContext } from "../chat/conversation.runtime.ts";
import { type ChatMessage, createUserMessage } from "../chat/shared.ts";
import type { AiClient } from "./ai-client.ts";
import { clampDecisionConfidence, getMissingRequiredToolArgumentFields } from "./provider.logic.ts";
import type { AllowedTool, ProviderConversationResponseKind, ProviderExecutionState } from "./provider.types.ts";
import type { PendingToolConfirmation } from "../chat/shared.ts";

export type ConversationDecision =
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

export type RawConversationDecision = {
  tool?: string;
  arguments?: Record<string, unknown>;
  data?: Record<string, unknown>;
  reasoning?: string;
  follow_up?: string | null;
  followUp?: string | null;
  confidence?: number;
};

export const getConversationResponseKind = ({
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

export const tokenize = (input: string) =>
  input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));

export const parseJsonObject = <T>(content: string): T | null => {
  const trimmed = content.trim();
  const candidate =
    trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed : trimmed.match(/\{[\s\S]*\}/)?.[0];

  if (!candidate) {
    return null;
  }

  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
};

export const normalizeNullableModelText = (value: unknown) => {
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

export const buildDecisionReasoning = (value: unknown) => {
  const normalized = normalizeNullableModelText(value);
  return normalized || null;
};

export const callDecisionModel = async ({
  aiClient,
  messages,
  timeZone,
  stage = "routing",
  aiApiKey,
}: {
  aiClient: AiClient;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  timeZone?: string | null;
  stage?: "routing" | "extraction";
  aiApiKey?: string;
}) => {
  if (stage === "extraction") {
    return aiClient.extract({ messages, timeZone, apiKey: aiApiKey });
  }
  return aiClient.route({ messages, timeZone, apiKey: aiApiKey });
};

export const formatAllowedTools = (tools: AllowedTool[]) => {
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

const scoreToolRelevance = ({ tool, content }: { tool: AllowedTool; content: string }) => {
  const contentTokens = new Set(tokenize(content));

  if (contentTokens.size === 0) {
    return 0;
  }

  const toolCorpus = [tool.toolName, tool.description, JSON.stringify(tool.inputSchema)].join(" ");
  const toolTokens = new Set(tokenize(toolCorpus));
  let matches = 0;

  for (const token of contentTokens) {
    if (toolTokens.has(token)) {
      matches += 1;
    }
  }

  return matches / Math.max(contentTokens.size, 1);
};

export const getCandidateTools = ({
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

export const buildMissingToolArgumentQuestion = ({
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

export const validateToolDecision = ({
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

export const buildDirectReply = async ({
  aiClient,
  content,
  messages,
  memoryContext,
  timeZone,
  aiApiKey,
}: {
  aiClient: AiClient;
  content: string;
  messages: ChatMessage[];
  memoryContext: string | null;
  timeZone?: string | null;
  aiApiKey?: string;
}) => {
  return aiClient.reply({
    apiKey: aiApiKey,
    timeZone,
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

const IDENTITY_QUESTION_PATTERNS = [
  /\bwho\s+are\s+you\b/,
  /\bwhat\s+are\s+you\b/,
  /\bwhat\s+can\s+you\s+do\b/,
  /\bwhat\s+tools\s+(?:are\s+available|do\s+you\s+have)\b/,
];

export const isIdentityQuestion = (content: string): boolean =>
  IDENTITY_QUESTION_PATTERNS.some((pattern) => pattern.test(content.toLowerCase()));

export const buildIdentityResponse = (tools: AllowedTool[]): string => {
  const activeTools = tools.filter((tool) => tool.status === "active");

  if (activeTools.length === 0) {
    return "I am a tool routing tool. There are no available tools right now.";
  }

  const list = activeTools.map((tool) => `- ${tool.toolName}: ${tool.description}`).join("\n");
  return `I am a tool routing tool. Here are the available tools:\n${list}`;
};

export const createDecideConversationAction = (deps: { aiClient: AiClient }) => {
  const decide = async ({
    content,
    messages,
    memoryContext,
    tools,
    replyModel: _replyModel,
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
  }): Promise<ConversationDecision> => {
    if (isIdentityQuestion(content)) {
      return {
        action: "direct_reply",
        reply: buildIdentityResponse(tools),
        reasoning: "User asked about my identity or available tools.",
      };
    }

    if (tools.filter((tool) => tool.status === "active").length === 0) {
      if (!generateReply) {
        return {
          action: "direct_reply",
          reply: "",
        } satisfies ConversationDecision;
      }

      const reply = await buildDirectReply({
        aiClient: deps.aiClient,
        content,
        messages,
        memoryContext,
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
      aiClient: deps.aiClient,
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
        aiClient: deps.aiClient,
        content,
        messages,
        memoryContext,
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

  return decide;
};
