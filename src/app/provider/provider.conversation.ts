import { env } from "cloudflare:workers";

import {
  createDefaultAiClient,
  type AiClient,
  type AiEnv,
} from "./ai-client.ts";
import { buildDirectReply, buildDirectReplyStream } from "./provider.decision.ts";
import { saveConversationTurn } from "./provider.conversation.storage.ts";
import {
  buildPromptContext,
  createDateTimeSystemPrompt,
  DEFAULT_MODEL,
  resolveConversationTimeZone,
} from "../chat/conversation.runtime.ts";
import {
  loadChatSession,
  saveChatSession,
  saveThreadMessages,
} from "../chat/chat.storage.ts";
import {
  createAssistantMessage,
  createToolMessage,
  createUserMessage,
  type ChatMessage,
  type ChatSessionState,
  type ChatThreadSummary,
  type PendingToolConfirmation,
} from "../chat/shared.ts";
import {
  callDecisionModel,
  parseJsonObject,
  normalizeNullableModelText,
  buildMissingToolArgumentQuestion,
} from "./provider.decision.ts";
import {
  buildPendingConfirmationReminder,
  buildToolConfirmationQuestion,
  buildLowConfidenceToolQuestion,
  normalizeToolArguments,
  normalizeToolExecutionInput,
} from "./provider.tool-helpers.ts";
import {
  resolveThreadId,
  createThreadForContext,
  updateThreadSummaries,
  buildThreadSummary,
  updateChannelState,
  updateThreadChannelState,
} from "./provider.threads.ts";
import {
  refreshProviderMemories,
  runProfileSynthesis,
  isSynthesisDue,
  isCalibrationRequest,
} from "./provider.memory-runtime.ts";
import {
  enforceConversationRateLimit,
} from "./provider.rate-limit.ts";
import {
  buildShortcutRawInputText,
  buildShortcutToolArguments,
  clampDecisionConfidence,
  getMissingRequiredToolArgumentFields,
  getRawToolStringFieldName,
  getToolDecisionConfidenceAction,
  getToolInputMode,
  hasMeaningfulToolArgumentValue,
  interpretPendingToolConfirmation,
  MAX_CHUNK_BYTES,
  MAX_INPUT_TEXT_BYTES,
  MAX_MESSAGES_PER_THREAD,
  normalizeAllowedTools,
  parseToolShortcutInvocation,
  parseToolShortcutInvocations,
  selectProviderGlobalMemory,
  validateInputText,
  validateToolArguments,
} from "./provider.logic.ts";
import {
  executeProviderToolRequest,
  sendProviderChannelMessage,
} from "./provider.execution.ts";
import { executeProviderToolRequestViaWebSocket } from "./provider.execution-websocket.ts";
import { logProviderAudit } from "./provider.audit.ts";
import {
  loadOrCreateProviderUserContext,
  saveProviderUserContext,
  recordPendingExecution,
  clearPendingExecution,
} from "./provider.storage.ts";
import type {
  AllowedTool,
  ProviderChannelInput,
  ProviderConfig,
  ProviderConversationResponseKind,
  ProviderExecutionState,
  ProviderUserContext,
  RawToolArgumentUpdate,
} from "./provider.types.ts";
import { createDecideConversationAction, getConversationResponseKind } from "./provider.decision.ts";
import type { ConversationDecision } from "./provider.decision.ts";
import type { NormalizedProviderConversationInput } from "./provider.conversation.endpoint.core.ts";
import { createMemoryBackend } from "../memory/memory.factory.ts";
import { requestInfo } from "rwsdk/worker";

const defaultAiClient = createDefaultAiClient(env as AiEnv);

export const appendMessagesToThread = async ({
  threadId,
  messages,
  pendingToolConfirmation,
}: {
  threadId: string;
  messages: ChatMessage[];
  pendingToolConfirmation?: PendingToolConfirmation | null;
}) => {
  const currentState = await loadChatSession(threadId);
  return saveThreadMessages({
    threadId,
    currentState,
    messages,
    pendingToolConfirmation,
  });
};

const appendChunkToThreadMessage = async ({
  threadId,
  text,
}: {
  threadId: string;
  text: string;
}) => {
  const currentState = await loadChatSession(threadId);
  const lastMessage = currentState.messages.at(-1);

  if (lastMessage && lastMessage.role === "user") {
    const newContent = `${lastMessage.content}\n${text}`;
    const totalBytes = new TextEncoder().encode(newContent).length;
    if (totalBytes > MAX_INPUT_TEXT_BYTES) {
      throw new Error(
        `Total message size exceeds maximum of ${MAX_INPUT_TEXT_BYTES} bytes (${(MAX_INPUT_TEXT_BYTES / 1024).toFixed(0)}KB).`,
      );
    }
    const nextMessages = currentState.messages.slice(0, -1);
    nextMessages.push({
      ...lastMessage,
      content: newContent,
    });
    const nextState = {
      ...currentState,
      messages: nextMessages,
    };
    await saveChatSession(threadId, nextState);
    return { appended: true, totalBytes };
  }

  const nextState = await saveThreadMessages({
    threadId,
    currentState,
    messages: [createUserMessage(text)],
  });
  return { appended: true, totalBytes: new TextEncoder().encode(text).length };
};

const getRequestTimeZone = (timeZone?: string | null) =>
  resolveConversationTimeZone(timeZone);

const buildToolMessages = (toolName: string, args: Record<string, unknown>, resultMessage: string): ChatMessage[] => {
  const toolCallId = `call_${crypto.randomUUID().replace(/-/g, "")}`;
  return [
    createAssistantMessage("", [{
      id: toolCallId,
      type: "function",
      function: { name: toolName, arguments: JSON.stringify(args) },
    }]),
    createToolMessage(resultMessage, toolCallId),
  ];
};

const SYSTEM_PROMPT =
  "You are familiar, a concise conversational orchestration assistant. Return direct, useful replies without filler.";

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

export const decideConversationAction = createDecideConversationAction({ aiClient: defaultAiClient });

const updatePendingToolArguments = async ({
  aiClient = defaultAiClient,
  tool,
  currentArguments,
  userReply,
  question,
  timeZone,
  aiApiKey,
}: {
  aiClient?: AiClient;
  tool: AllowedTool;
  currentArguments: Record<string, unknown>;
  userReply: string;
  question?: string;
  timeZone?: string | null;
  aiApiKey?: string;
}) => {
  const decision = await callDecisionModel({
    aiClient,
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
  inputSchema,
  context,
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
  inputSchema?: Record<string, unknown>;
  context?: ProviderUserContext;
}) => {
  validateToolArguments(toolName, args, inputSchema);

  const requestUrl = requestInfo?.request?.url;
  const resultWebhookUrl = requestUrl
    ? `${new URL(requestUrl).origin}/api/v1/webhooks/executor`
    : null;

  const result =
    providerConfig.transport === "websocket"
      ? await executeProviderToolRequestViaWebSocket({
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
        })
      : await executeProviderToolRequest({
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
        });

  // Record the pending execution so the executor callback only needs execution_id
  await recordPendingExecution({
    providerId,
    userId,
    executionId: result.executionId,
    threadId,
    toolName,
    context,
  });

  return result;
};

const scheduleBackgroundTask = (task: Promise<unknown>) => {
  try {
    requestInfo?.cf?.waitUntil?.(task);
  } catch {
    void task;
  }
};

export const handleProviderConversationInput = async ({
  input,
  providerConfig,
  requestId,
  aiClient = defaultAiClient,
  context: initialContext,
}: {
  input: NormalizedProviderConversationInput;
  providerConfig: ProviderConfig;
  requestId?: string;
  aiClient?: AiClient;
  context?: ProviderUserContext;
}) => {
  const decide = createDecideConversationAction({ aiClient });
  const model = input.model?.trim() || DEFAULT_MODEL;
  const timeZone = getRequestTimeZone(input.timezone);
  let context = initialContext ?? await loadOrCreateProviderUserContext({
    providerId: input.integration_id,
    userId: input.user_id,
  });
  const content = validateInputText(input.input.text);

  context = enforceConversationRateLimit({ context });
  if (input.tools) {
    context = {
      ...context,
      allowedTools: normalizeAllowedTools(input.tools),
    };
  }

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

  const resolved = await resolveThreadId({
    context,
    providedThreadId: input.thread_id,
    channel: input.channel,
    content,
  });
  let threadId = resolved.threadId;
  let currentState: ChatSessionState | undefined = resolved.session;
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

  // Handle chunked input: append to last user message instead of creating a new turn
  if (input.input.append) {
    const chunkText = validateInputText(input.input.text, MAX_CHUNK_BYTES);
    const appendResult = await appendChunkToThreadMessage({ threadId, text: chunkText });

    if (!input.input.final) {
      return {
        thread_id: threadId,
        appended: true,
        total_bytes: appendResult.totalBytes,
      };
    }
  }

  const thread = currentContext.threads.find((entry) => entry.id === threadId);

  if (!thread) {
    throw new Error("Thread not found.");
  }

  if (!currentState) {
    currentState = await loadChatSession(threadId);
  }
  const afterUserState: ChatSessionState = {
    ...currentState,
    messages: [...currentState.messages, createUserMessage(content)],
  };
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

  let assistantContent = "";
  let action:
    | "direct_reply"
    | "clarification"
    | "tool_call"
    | "command" = "direct_reply";
  let executionState: ProviderExecutionState | undefined;
  let executionId: string | undefined;
  let pendingToolConfirmation: PendingToolConfirmation | null = null;
  let toolMessages: ChatMessage[] = [];
  let decisionReasoning: string | null = null;
  let replySource: "routing_model" | "reply_model" | "tool" = "tool";
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
          inputSchema: entry.tool.inputSchema,
          context: currentContext,
        });

        toolMessages = buildToolMessages(
          entry.tool.toolName,
          buildShortcutToolArguments({ tool: entry.tool, content: entry.remainder }),
          execution.message,
        );
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
          inputSchema: pendingTool?.inputSchema,
          context: currentContext,
        });

        toolMessages = buildToolMessages(
          currentState.pendingToolConfirmation.toolName,
          currentState.pendingToolConfirmation.arguments,
          execution.message,
        );
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
        aiClient,
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
          inputSchema: pendingTool?.inputSchema,
          context: currentContext,
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
    const decision = await decide({
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
      replySource = decision.useReplyModel ? "reply_model" : "routing_model";
      if (decision.useReplyModel) {
        assistantContent = await buildDirectReply({
          aiClient,
          content,
          messages: currentState.messages,
          memoryContext,
          timeZone,
          aiApiKey: providerConfig.aiApiKey,
        });
      } else {
        assistantContent = decision.reply;
      }
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
          inputSchema: tool?.inputSchema,
          context: currentContext,
        });

        toolMessages = buildToolMessages(
          decision.tool_name,
          normalizedInput.arguments,
          execution.message,
        );
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

  const [withAssistant, finalContext] = await saveConversationTurn({
    threadId,
    currentState: afterUserState,
    assistantContent,
    toolMessages,
    pendingToolConfirmation,
    thread,
    currentContext,
    model,
    channel: input.channel,
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
      replySource,
    },
  });

  return {
    status: "done",
    reasoning: decisionReasoning,
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
    metadata: {
      reply_source: replySource,
    },
  };
};

export const handleStreamConversationInput = async ({
  input,
  providerConfig,
  requestId,
  aiClient = defaultAiClient,
  context: initialContext,
}: {
  input: NormalizedProviderConversationInput;
  providerConfig: ProviderConfig;
  requestId?: string;
  aiClient?: AiClient;
  context?: ProviderUserContext;
}) => {
  const decide = createDecideConversationAction({ aiClient });
  const model = input.model?.trim() || DEFAULT_MODEL;
  const timeZone = getRequestTimeZone(input.timezone);
  let context = initialContext ?? await loadOrCreateProviderUserContext({
    providerId: input.integration_id,
    userId: input.user_id,
  });
  const content = validateInputText(input.input.text);

  context = enforceConversationRateLimit({ context });
  if (input.tools) {
    context = {
      ...context,
      allowedTools: normalizeAllowedTools(input.tools),
    };
  }

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

  const resolved = await resolveThreadId({
    context,
    providedThreadId: input.thread_id,
    channel: input.channel,
    content,
  });
  let threadId = resolved.threadId;
  let currentState: ChatSessionState | undefined = resolved.session;
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

  // Handle chunked input: append to last user message instead of creating a new turn
  if (input.input.append) {
    const chunkText = validateInputText(input.input.text, MAX_CHUNK_BYTES);
    const appendResult = await appendChunkToThreadMessage({ threadId, text: chunkText });

    if (!input.input.final) {
      return {
        thread_id: threadId,
        appended: true,
        total_bytes: appendResult.totalBytes,
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(`data: ${JSON.stringify({ appended: true, thread_id: threadId, total_bytes: appendResult.totalBytes })}\n\n`);
            controller.close();
          },
        }),
      };
    }
  }

  const thread = currentContext.threads.find((entry) => entry.id === threadId);

  if (!thread) {
    throw new Error("Thread not found.");
  }

  if (!currentState) {
    currentState = await loadChatSession(threadId);
  }
  const afterUserState: ChatSessionState = {
    ...currentState,
    messages: [...currentState.messages, createUserMessage(content)],
  };
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
  let finalReplySource: "routing_model" | "reply_model" | "tool" = "tool";

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
          inputSchema: entry.tool.inputSchema,
          context: currentContext,
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
          inputSchema: pendingTool?.inputSchema,
          context: currentContext,
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
        aiClient,
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
          inputSchema: pendingTool?.inputSchema,
          context: currentContext,
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
    const decision = await decide({
      content,
      messages: currentState.messages,
      memoryContext,
      tools: currentContext.allowedTools,
      replyModel: model,
      timeZone,
      aiApiKey: providerConfig.aiApiKey,
      generateReply: true,
    });
    decisionReasoning = decision.reasoning ?? null;
    streamDecision = decision;
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (payload: {
        status: "busy" | "done" | "error" | "pending";
        reasoning?: string | null;
        [key: string]: unknown;
      }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        let assistantContent = preComputedContent;
        let finalAction: "direct_reply" | "clarification" | "tool_call" | "command" = preComputedAction;
        let finalExecutionState: ProviderExecutionState | undefined = preComputedExecutionState;
        let finalExecutionId: string | undefined = preComputedExecutionId;
        let finalPendingToolConfirmation: PendingToolConfirmation | null = preComputedPendingToolConfirmation;

        if (streamDecision?.action === "direct_reply") {
          finalReplySource = streamDecision.useReplyModel ? "reply_model" : "routing_model";
          if (streamDecision.useReplyModel) {
            emit({ status: "busy", reasoning: decisionReasoning });
            let streamedContent = "";
            for await (const chunk of buildDirectReplyStream({
              aiClient,
              content,
              messages: currentState.messages,
              memoryContext,
              timeZone,
              aiApiKey: providerConfig.aiApiKey,
            })) {
              streamedContent += chunk;
              emit({ status: "busy", reasoning: decisionReasoning, delta: chunk });
            }
            assistantContent = streamedContent;
          } else {
            assistantContent = streamDecision.reply;
          }
          finalAction = "direct_reply";
        } else if (streamDecision?.action === "clarification") {
          assistantContent = streamDecision.question;
          finalAction = "clarification";
          finalExecutionState = "needs_clarification";
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
          } else {
            emit({ status: "busy", reasoning: decisionReasoning });
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
              inputSchema: tool?.inputSchema,
              context: currentContext,
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
          }
        }

        const isStreamingReply =
          streamDecision?.action === "direct_reply" && streamDecision.useReplyModel === true;
        if (!isStreamingReply) {
          emit({
            status: "busy",
            reasoning: decisionReasoning,
            response: {
              type: getConversationResponseKind({
                action: finalAction,
                executionState: finalExecutionState,
                pendingToolConfirmation: finalPendingToolConfirmation,
              }),
              content: assistantContent,
              reasoning: decisionReasoning,
              task_status:
                finalExecutionState ?? (finalAction === "tool_call" ? "completed" : null),
            },
            action: finalAction,
            execution:
              finalExecutionState || finalExecutionId
                ? {
                    state: finalExecutionState ?? null,
                    execution_id: finalExecutionId ?? null,
                  }
                : null,
            model,
            metadata: {
              reply_source: finalReplySource,
            },
          });
        }

        const [withAssistant, finalContext] = await saveConversationTurn({
          threadId,
          currentState: afterUserState,
          assistantContent,
          pendingToolConfirmation: finalPendingToolConfirmation,
          thread,
          currentContext,
          model,
          channel: input.channel,
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
            replySource: finalReplySource,
          },
        });

        const isPending =
          finalExecutionState === "accepted" || finalExecutionState === "in_progress";
        emit({
          status: isPending ? "pending" : "done",
          reasoning: decisionReasoning,
          thread_id: threadId,
          response: {
            type: getConversationResponseKind({
              action: finalAction,
              executionState: finalExecutionState,
              pendingToolConfirmation: finalPendingToolConfirmation,
            }),
            content: assistantContent,
            reasoning: decisionReasoning,
            task_status:
              finalExecutionState ?? (finalAction === "tool_call" ? "completed" : null),
          },
          action: finalAction,
          execution:
            finalExecutionState || finalExecutionId
              ? {
                  state: finalExecutionState ?? null,
                  execution_id: finalExecutionId ?? null,
                }
              : null,
          model,
          metadata: {
            reply_source: finalReplySource,
          },
          messages: withAssistant.messages.map((m) => ({
            message_id: m.id,
            role: m.role,
            content: m.content,
            created_at: m.createdAt,
          })),
        });

        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Stream error.";
        emit({ status: "error", reasoning: message, error: { code: "internal_error", message } });
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
  aiClient = defaultAiClient,
}: {
  input: NormalizedProviderConversationInput;
  providerConfig: ProviderConfig;
  requestId?: string;
  aiClient?: AiClient;
}) => {
  const decide = createDecideConversationAction({ aiClient });
  const model = input.model?.trim() || DEFAULT_MODEL;
  const timeZone = getRequestTimeZone(input.timezone);
  const context = await loadOrCreateProviderUserContext({
    providerId: input.integration_id,
    userId: input.user_id,
  });
  const content = validateInputText(input.input.text);

  const resolved = await resolveThreadId({
    context,
    providedThreadId: input.thread_id,
    channel: input.channel,
    content,
  });
  const threadId = resolved.threadId;

  if (!threadId) {
    throw new Error("No thread found or created for simulation.");
  }

  // Handle chunked input: append to last user message instead of creating a new turn
  if (input.input.append) {
    const chunkText = validateInputText(input.input.text, MAX_CHUNK_BYTES);
    const appendResult = await appendChunkToThreadMessage({ threadId, text: chunkText });

    if (!input.input.final) {
      return {
        thread_id: threadId,
        appended: true,
        total_bytes: appendResult.totalBytes,
      };
    }
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

  const decision = await decide({
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


