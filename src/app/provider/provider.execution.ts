import {
  BUILT_IN_DEMO_PROVIDER_ID,
  executeBuiltInDemoTool,
} from "./provider.demo.ts";
import type {
  ProviderChannelInput,
  ProviderConfig,
  ProviderExecutionState,
} from "./provider.types";

type ProviderToolExecutionResponse = {
  ok: boolean;
  state?: ProviderExecutionState;
  result?: {
    summary?: string;
    data?: Record<string, unknown>;
  };
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

type ProviderToolExecutionResult = {
  executionId: string;
  state: ProviderExecutionState;
  message: string;
  data: Record<string, unknown> | null;
};

const VALID_EXECUTION_STATES = new Set<ProviderExecutionState>([
  "completed",
  "needs_clarification",
  "accepted",
  "in_progress",
  "failed",
]);

const EXECUTOR_REQUEST_TIMEOUT_MS = 15_000;

const EXECUTOR_PAYLOAD_TOKENS = {
  "$execution_id": "execution_id",
  "$integration_id": "integration_id",
  "$user_id": "user_id",
  "$thread_id": "thread_id",
  "$tool_name": "tool_name",
  "$arguments": "arguments",
  "$context": "context",
  "$request_id": "request_id",
  "$channel": "channel",
  "$raw_input_text": "raw_input_text",
  "$shortcut_mode": "shortcut_mode",
  "$executor_result_webhook_url": "executor_result_webhook_url",
} as const;

type ExecutorPayloadContext = {
  execution_id: string;
  integration_id: string;
  user_id: string;
  thread_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  context: {
    request_id: string;
    thread_id: string;
    channel?: ProviderChannelInput;
    executor_result_webhook_url?: string;
    raw_input_text?: string;
    shortcut_mode?: boolean;
  };
  request_id: string;
  channel?: ProviderChannelInput;
  raw_input_text?: string;
  shortcut_mode?: boolean;
  executor_result_webhook_url?: string;
};

const resolveExecutorPayloadTemplate = (
  value: unknown,
  context: ExecutorPayloadContext,
): unknown => {
  if (typeof value === "string") {
    const tokenKey =
      EXECUTOR_PAYLOAD_TOKENS[value as keyof typeof EXECUTOR_PAYLOAD_TOKENS];

    if (tokenKey) {
      return context[tokenKey];
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveExecutorPayloadTemplate(entry, context));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        resolveExecutorPayloadTemplate(entry, context),
      ]),
    );
  }

  return value;
};

export const buildExecutorToolUrl = (baseUrl: string) =>
  `${baseUrl.replace(/\/$/, "")}/tools/execute`;

export const buildProviderChannelMessageUrl = (baseUrl: string) =>
  `${baseUrl.replace(/\/$/, "")}/channels/messages`;

export const normalizeProviderToolExecution = ({
  executionId,
  responseOk,
  payload,
}: {
  executionId: string;
  responseOk: boolean;
  payload: ProviderToolExecutionResponse;
}): ProviderToolExecutionResult => {
  if (!responseOk || !payload.ok) {
    return {
      executionId,
      state: "failed" as const,
      message:
        payload.error?.message ||
        "The executor failed to execute the requested tool.",
      data: null,
    };
  }

  const state = payload.state ?? "completed";

  if (!VALID_EXECUTION_STATES.has(state)) {
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
};

export const executeProviderToolRequest = async ({
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
  shortcutMode = false,
  executorPayloadTemplate,
  fetchImpl = fetch,
  timeoutMs = EXECUTOR_REQUEST_TIMEOUT_MS,
}: {
  providerConfig: ProviderConfig;
  providerId: string;
  userId: string;
  threadId: string;
  toolName: string;
  args: Record<string, unknown>;
  requestId?: string;
  channel?: ProviderChannelInput;
  resultWebhookUrl?: string | null;
  rawInputText?: string;
  shortcutMode?: boolean;
  executorPayloadTemplate?: unknown;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) => {
  const executionId = crypto.randomUUID();

  if (providerId === BUILT_IN_DEMO_PROVIDER_ID) {
    const result = await executeBuiltInDemoTool({
      toolName,
      args,
      userId,
    });

    return {
      executionId,
      ...result,
    };
  }

  if (!providerConfig.baseUrl) {
    throw new Error("Executor base URL is not configured.");
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  const requestIdValue = requestId ?? crypto.randomUUID();
  const requestContext = {
    request_id: requestIdValue,
    thread_id: threadId,
    channel,
    executor_result_webhook_url: resultWebhookUrl ?? undefined,
    raw_input_text: rawInputText ?? undefined,
    shortcut_mode: shortcutMode || undefined,
  };
  const requestBody =
    executorPayloadTemplate !== undefined
      ? resolveExecutorPayloadTemplate(executorPayloadTemplate, {
          execution_id: executionId,
          integration_id: providerId,
          user_id: userId,
          thread_id: threadId,
          tool_name: toolName,
          arguments: args,
          context: requestContext,
          request_id: requestIdValue,
          channel,
          raw_input_text: rawInputText ?? undefined,
          shortcut_mode: shortcutMode || undefined,
          executor_result_webhook_url: resultWebhookUrl ?? undefined,
        })
      : {
          execution_id: executionId,
          integration_id: providerId,
          user_id: userId,
          thread_id: threadId,
          tool_name: toolName,
          arguments: args,
          context: requestContext,
        };

  try {
    const response = await fetchImpl(buildExecutorToolUrl(providerConfig.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerConfig.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    let payload: ProviderToolExecutionResponse;

    try {
      payload = (await response.json()) as ProviderToolExecutionResponse;
    } catch {
      return {
        executionId,
        state: "failed" as const,
        message: "The executor returned an invalid JSON response.",
        data: null,
      };
    }

    return normalizeProviderToolExecution({
      executionId,
      responseOk: response.ok,
      payload,
    });
  } catch (error) {
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
      message: "The executor could not be reached.",
      data: null,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
};

export const sendProviderChannelMessage = async ({
  providerConfig,
  providerId,
  userId,
  threadId,
  channel,
  content,
  task,
  requestId,
  fetchImpl = fetch,
}: {
  providerConfig: ProviderConfig;
  providerId: string;
  userId: string;
  threadId: string;
  channel: ProviderChannelInput;
  content: string;
  task?: {
    executionId?: string;
    toolName?: string;
    state: ProviderExecutionState;
    data?: Record<string, unknown>;
  };
  requestId?: string;
  fetchImpl?: typeof fetch;
}) => {
  if (!providerConfig.baseUrl) {
    throw new Error("Executor base URL is not configured.");
  }

  const response = await fetchImpl(buildProviderChannelMessageUrl(providerConfig.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerConfig.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      integration_id: providerId,
      user_id: userId,
      thread_id: threadId,
      channel,
      message: {
        kind: "text",
        text: content,
      },
      task: task
        ? {
            execution_id: task.executionId,
            tool_name: task.toolName,
            state: task.state,
            data: task.data,
          }
        : undefined,
      context: {
        request_id: requestId ?? crypto.randomUUID(),
      },
    }),
  });

  return response.ok;
};
