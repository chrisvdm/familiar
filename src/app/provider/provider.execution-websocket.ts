import { env } from "cloudflare:workers";

import type {
  ProviderConfig,
  ProviderChannelInput,
  ProviderExecutionState,
} from "./provider.types.ts";

export const executeProviderToolRequestViaWebSocket = async ({
  providerConfig,
  providerId,
  userId,
  threadId,
  toolName,
  args,
  requestId,
  channel,
  rawInputText,
  shortcutMode = false,
  executorPayloadTemplate,
  timeoutMs = 15_000,
}: {
  providerConfig: ProviderConfig;
  providerId: string;
  userId: string;
  threadId: string;
  toolName: string;
  args: Record<string, unknown>;
  requestId?: string;
  channel?: ProviderChannelInput;
  rawInputText?: string;
  shortcutMode?: boolean;
  executorPayloadTemplate?: unknown;
  timeoutMs?: number;
}) => {
  const executionId = crypto.randomUUID();
  const requestIdValue = requestId ?? crypto.randomUUID();

  const requestBody =
    executorPayloadTemplate !== undefined
      ? {
          execution_id: executionId,
          integration_id: providerId,
          user_id: userId,
          thread_id: threadId,
          tool_name: toolName,
          arguments: args,
          context: {
            request_id: requestIdValue,
            thread_id: threadId,
            channel,
            raw_input_text: rawInputText ?? undefined,
            shortcut_mode: shortcutMode || undefined,
          },
        }
      : {
          execution_id: executionId,
          integration_id: providerId,
          user_id: userId,
          thread_id: threadId,
          tool_name: toolName,
          arguments: args,
          context: {
            request_id: requestIdValue,
            thread_id: threadId,
            channel,
            raw_input_text: rawInputText ?? undefined,
            shortcut_mode: shortcutMode || undefined,
          },
        };

  const id = env.EXECUTOR_CONNECTIONS.idFromName(providerId);
  const stub = env.EXECUTOR_CONNECTIONS.get(id);

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await stub.fetch(new Request("https://internal/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    }));

    clearTimeout(timeoutHandle);

    const payload = (await response.json()) as {
      ok?: boolean;
      state?: string;
      result?: { summary?: string; data?: Record<string, unknown> };
      error?: { message?: string };
    };

    if (!response.ok || !payload.ok) {
      return {
        executionId,
        state: "failed" as const,
        message:
          payload.error?.message || "The executor failed to execute the requested tool.",
        data: null,
      };
    }

    const state = (payload.state ?? "completed") as ProviderExecutionState;
    const validStates = new Set<ProviderExecutionState>([
      "completed",
      "needs_clarification",
      "accepted",
      "in_progress",
      "failed",
    ]);

    if (!validStates.has(state)) {
      return {
        executionId,
        state: "failed" as const,
        message: "The executor returned an invalid execution state.",
        data: null,
      };
    }

    const message =
      payload.result?.summary ||
      (state === "accepted"
        ? "The executor accepted the request."
        : state === "in_progress"
          ? "The requested work is now in progress."
          : state === "needs_clarification"
            ? "The executor needs more information to continue."
            : "The tool ran successfully.");

    return {
      executionId,
      state,
      message,
      data: payload.result?.data ?? null,
    };
  } catch (error) {
    clearTimeout(timeoutHandle);

    if (error instanceof Error && error.name === "AbortError") {
      return {
        executionId,
        state: "failed" as const,
        message: "The executor request timed out.",
        data: null,
      };
    }

    return {
      executionId,
      state: "failed" as const,
      message: "Your local agent is currently offline. The request will be delivered when it reconnects.",
      data: null,
    };
  }
};
