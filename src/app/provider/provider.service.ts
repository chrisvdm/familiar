import { requestInfo } from "rwsdk/worker";

import { updateIntegrationToolUrls } from "../account/account.service.ts";
import { createAssistantMessage } from "../chat/shared.ts";
import { validateExecutorUrl } from "./provider.auth-core.ts";
import { logProviderAudit } from "./provider.audit.ts";
import { appendMessagesToThread } from "./provider.conversation.ts";
import { sendProviderChannelMessage } from "./provider.execution.ts";
import {
  MAX_TOOLS_PER_SYNC,
  normalizeAllowedTools,
  SOFT_TOOLS_LIMIT,
} from "./provider.logic.ts";
import { refreshProviderMemories } from "./provider.memory-runtime.ts";
import { enforceToolsSyncRateLimit, isProviderRateLimitError } from "./provider.rate-limit.ts";
import {
  clearPendingExecution,
  loadOrCreateProviderUserContext,
  saveProviderUserContext,
} from "./provider.storage.ts";
import {
  buildThreadSummary,
  updateChannelState,
  updateThreadChannelState,
  updateThreadSummaries,
} from "./provider.threads.ts";
import type {
  ProviderConfig,
  ProviderExecutorResultInput,
  ProviderToolSyncInput,
  ProviderUserContext,
} from "./provider.types.ts";

type NormalizedProviderToolSyncInput = ProviderToolSyncInput & {
  integration_id: string;
  user_id: string;
};

type NormalizedProviderExecutorResultInput = ProviderExecutorResultInput & {
  integration_id: string;
  user_id: string;
};

export { isProviderRateLimitError };

const scheduleBackgroundTask = (task: Promise<unknown>) => {
  try {
    requestInfo?.cf?.waitUntil?.(task);
  } catch {
    void task;
  }
};

export const syncProviderTools = async (
  input: NormalizedProviderToolSyncInput,
  requestId?: string,
  accountId?: string,
) => {
  if (input.tools.length > MAX_TOOLS_PER_SYNC) {
    throw new Error(
      `Too many tools in sync request. Absolute maximum is ${MAX_TOOLS_PER_SYNC}. Consider splitting across multiple integrations.`,
    );
  }

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

  if (accountId) {
    const toolUrls: Record<string, string> = {};

    for (const tool of input.tools) {
      if (typeof tool.base_url === "string" && tool.base_url.trim()) {
        toolUrls[tool.tool_name] = validateExecutorUrl(
          tool.base_url,
          `Tool URL for ${tool.tool_name}`,
        );
      }
    }

    if (Object.keys(toolUrls).length > 0) {
      await updateIntegrationToolUrls({
        accountId,
        integrationId: input.integration_id,
        toolUrls,
      });
    }
  }

  const softLimitWarning =
    input.tools.length > SOFT_TOOLS_LIMIT
      ? `Tool count (${input.tools.length}) exceeds recommended soft limit of ${SOFT_TOOLS_LIMIT}. Consider splitting across multiple integrations for better performance.`
      : undefined;

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
    ...(softLimitWarning ? { warning: softLimitWarning } : {}),
  };
};

type ProviderToolInput = NormalizedProviderToolSyncInput["tools"][number];
type NormalizedProviderToolAddInput = {
  integration_id: string;
  user_id: string;
  tool: ProviderToolInput;
};

export const addProviderTool = async (
  input: NormalizedProviderToolAddInput,
  requestId?: string,
  accountId?: string,
) => {
  const normalizedTool = normalizeAllowedTools([input.tool])[0];

  if (!normalizedTool) {
    throw new Error("Invalid tool payload.");
  }

  const context = await loadOrCreateProviderUserContext({
    providerId: input.integration_id,
    userId: input.user_id,
  });

  const rateLimitedContext = enforceToolsSyncRateLimit({ context });

  const existingIndex = rateLimitedContext.allowedTools.findIndex(
    (tool) => tool.toolName === normalizedTool.toolName,
  );

  const nextAllowedTools =
    existingIndex >= 0
      ? [
          ...rateLimitedContext.allowedTools.slice(0, existingIndex),
          normalizedTool,
          ...rateLimitedContext.allowedTools.slice(existingIndex + 1),
        ]
      : [...rateLimitedContext.allowedTools, normalizedTool];

  const nextContext: ProviderUserContext = {
    ...rateLimitedContext,
    allowedTools: nextAllowedTools,
  };

  await saveProviderUserContext(nextContext);

  if (accountId && typeof input.tool.base_url === "string" && input.tool.base_url.trim()) {
    await updateIntegrationToolUrls({
      accountId,
      integrationId: input.integration_id,
      toolUrls: {
        [normalizedTool.toolName]: validateExecutorUrl(
          input.tool.base_url,
          `Tool URL for ${normalizedTool.toolName}`,
        ),
      },
    });
  }

  logProviderAudit({
    event: "provider.tool.added",
    requestId,
    providerId: input.integration_id,
    userId: input.user_id,
    status: "ok",
    metadata: {
      toolName: normalizedTool.toolName,
      totalTools: nextContext.allowedTools.length,
      updated: existingIndex >= 0,
    },
  });

  return {
    integration_id: input.integration_id,
    user_id: input.user_id,
    tool_name: normalizedTool.toolName,
    total_tools: nextContext.allowedTools.length,
    status: "ok",
    updated: existingIndex >= 0,
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

export const handleProviderExecutorResult = async ({
  input,
  providerConfig,
  requestId,
}: {
  input: NormalizedProviderExecutorResultInput;
  providerConfig: ProviderConfig;
  requestId?: string;
}) => {
  if (!input.thread_id) {
    throw new Error("thread_id is required.");
  }

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

  const threadId = input.thread_id;
  const channel =
    input.channel ??
    context.threadChannels?.[threadId] ??
    Object.values(context.channels).find(
      (entry) => entry.lastActiveThreadId === threadId,
    );

  const withAssistant = await appendMessagesToThread({
    threadId,
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
            threadId,
          }),
          threadChannels: updateThreadChannelState({
            context,
            channel,
            threadId,
          }),
        }
      : {}),
  });

  scheduleBackgroundTask(
    refreshProviderMemories({
      threadId,
      state: withAssistant,
      thread:
        nextContext.threads.find((entry) => entry.id === threadId) ?? thread,
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
        threadId,
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
    threadId,
    channelType: channel?.type,
    channelId: channel?.id,
    status: channelDelivery === "failed" ? "error" : "ok",
    metadata: {
      toolName: input.result.tool_name ?? null,
      executionState: input.result.state,
      channelDelivery,
    },
  });

  if (input.result.execution_id) {
    clearPendingExecution({
      providerId: input.integration_id,
      userId: input.user_id,
      executionId: input.result.execution_id,
    }).catch(() => {
      // best-effort cleanup
    });
  }

  return {
    integration_id: input.integration_id,
    user_id: input.user_id,
    thread_id: threadId,
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
