import { route } from "rwsdk/router";
import { requestInfo } from "rwsdk/worker";

import asyncCountdownTemplate from "../../../examples/async-countdown/index.html?raw";
import homePageTemplate from "../../../examples/minimal-executor/index.html?raw";
import pinnedToolTemplate from "../../../examples/pinned-tool/index.html?raw";
// @ts-expect-error example-only module imported into hosted demo route
import { executeToolCall as executeCountdownToolCall, getCountdownsForUser, markCountdownComplete, toolDefinitions as asyncCountdownTools } from "../../../examples/async-countdown/executor.mjs";
// @ts-expect-error example-only module imported into hosted demo route
import { executeToolCall as executePinnedToolCall, getToolEntriesForUser, toolDefinitions as pinnedToolTools } from "../../../examples/pinned-tool/executor.mjs";
// @ts-expect-error example-only module imported into hosted demo route
import { toolDefinitions as demoTools } from "../../../examples/minimal-executor/executor.mjs";
import {
  handleProviderConversationInput,
  syncProviderTools,
} from "./provider.service";
import { deleteProviderUserContext, loadProviderUserContext, resetProviderUserContext } from "./provider.storage";
import {
  BUILT_IN_COUNTDOWN_CHANNEL_ID,
  BUILT_IN_COUNTDOWN_PROVIDER_ID,
  BUILT_IN_DEMO_CHANNEL_ID,
  BUILT_IN_DEMO_PROVIDER_ID,
  BUILT_IN_DEMO_TOKEN,
  BUILT_IN_PINNED_TOOL_CHANNEL_ID,
  BUILT_IN_PINNED_TOOL_PROVIDER_ID,
  BUILT_IN_DEMO_USER_ID,
  executeBuiltInDemoTool,
  getBuiltInDemoTodos,
} from "./provider.demo";

const DEMO_TOKEN = BUILT_IN_DEMO_TOKEN;
const DEMO_EXECUTOR_ID = BUILT_IN_DEMO_PROVIDER_ID;
const DEMO_USER_ID = BUILT_IN_DEMO_USER_ID;
const DEMO_CHANNEL_ID = BUILT_IN_DEMO_CHANNEL_ID;
const COUNTDOWN_EXECUTOR_ID = BUILT_IN_COUNTDOWN_PROVIDER_ID;
const COUNTDOWN_CHANNEL_ID = BUILT_IN_COUNTDOWN_CHANNEL_ID;
const PINNED_TOOL_EXECUTOR_ID = BUILT_IN_PINNED_TOOL_PROVIDER_ID;
const PINNED_TOOL_CHANNEL_ID = BUILT_IN_PINNED_TOOL_CHANNEL_ID;
const COUNTDOWN_SECONDS = 10;
const countdownDeliveredChannelMessages = new Map<string, Array<Record<string, unknown>>>();
const pinnedToolDeliveredChannelMessages = new Map<string, Array<Record<string, unknown>>>();

const buildSyncBody = (userId: string) => ({
  integration_id: DEMO_EXECUTOR_ID,
  user_id: userId,
  tools: demoTools.map((tool: Record<string, unknown>) => ({
    ...tool,
    status: "active" as const,
  })),
});

const buildInputBody = (userId: string, text: string, threadId?: string | null) => ({
  integration_id: DEMO_EXECUTOR_ID,
  user_id: userId,
  ...(threadId ? { thread_id: threadId } : {}),
  input: {
    kind: "text" as const,
    text,
  },
  channel: {
    type: "web",
    id: DEMO_CHANNEL_ID,
  },
});

const renderHomePage = (origin: string) =>
  homePageTemplate
    .replaceAll("__PORT__", origin)
    .replaceAll("__TOKEN__", DEMO_TOKEN)
    .replaceAll("__TEXTY_BASE_URL__", origin)
    .replaceAll("__PROVIDER_ID__", DEMO_EXECUTOR_ID)
    .replaceAll("__USER_ID__", DEMO_USER_ID)
    .replaceAll("__PLAYGROUND_PATH__", "/sandbox/demo-executor/playground/texty")
    .replaceAll("__PLAYGROUND_MODE__", "direct");

const renderAsyncCountdownPage = (origin: string) =>
  asyncCountdownTemplate
    .replaceAll("__PORT__", origin)
    .replaceAll("__TOKEN__", DEMO_TOKEN)
    .replaceAll("__TEXTY_BASE_URL__", origin)
    .replaceAll("__INTEGRATION_ID__", COUNTDOWN_EXECUTOR_ID)
    .replaceAll("__USER_ID__", DEMO_USER_ID)
    .replaceAll("__PLAYGROUND_PATH__", "/sandbox/async-countdown/playground/texty");

const renderPinnedToolPage = (origin: string) =>
  pinnedToolTemplate
    .replaceAll("__PORT__", origin)
    .replaceAll("__TOKEN__", DEMO_TOKEN)
    .replaceAll("__TEXTY_BASE_URL__", origin)
    .replaceAll("__INTEGRATION_ID__", PINNED_TOOL_EXECUTOR_ID)
    .replaceAll("__USER_ID__", DEMO_USER_ID)
    .replaceAll("__PLAYGROUND_PATH__", "/sandbox/pinned-tool/playground/texty");

const buildCountdownSyncBody = (userId: string) => ({
  integration_id: COUNTDOWN_EXECUTOR_ID,
  user_id: userId,
  tools: asyncCountdownTools.map((tool: Record<string, unknown>) => ({
    ...tool,
    status: "active" as const,
  })),
});

const buildPinnedToolSyncBody = (userId: string) => ({
  integration_id: PINNED_TOOL_EXECUTOR_ID,
  user_id: userId,
  tools: pinnedToolTools.map((tool: Record<string, unknown>) => ({
    ...tool,
    status: "active" as const,
  })),
});

const buildCountdownInputBody = (userId: string, text: string, threadId?: string | null) => ({
  integration_id: COUNTDOWN_EXECUTOR_ID,
  user_id: userId,
  ...(threadId ? { thread_id: threadId } : {}),
  input: {
    kind: "text" as const,
    text,
  },
  channel: {
    type: "web",
    id: COUNTDOWN_CHANNEL_ID,
  },
});

const buildPinnedToolInputBody = (userId: string, text: string, threadId?: string | null) => ({
  integration_id: PINNED_TOOL_EXECUTOR_ID,
  user_id: userId,
  ...(threadId ? { thread_id: threadId } : {}),
  input: {
    kind: "text" as const,
    text,
  },
  channel: {
    type: "web",
    id: PINNED_TOOL_CHANNEL_ID,
  },
});

const appendDeliveredMessage = ({
  store,
  userId,
  payload,
}: {
  store: Map<string, Array<Record<string, unknown>>>;
  userId: string;
  payload: Record<string, unknown>;
}) => {
  const current = store.get(userId) ?? [];
  store.set(userId, [
    ...current,
    {
      received_at: new Date().toISOString(),
      payload,
    },
  ]);
};

const getDeliveredMessages = ({
  store,
  userId,
}: {
  store: Map<string, Array<Record<string, unknown>>>;
  userId: string;
}) => [...(store.get(userId) ?? [])];

const isCountdownRequest = (text: string) => /\b(countdown|timer)\b/i.test(text);

const scheduleBackgroundTask = (task: Promise<unknown>) => {
  try {
    requestInfo?.cf?.waitUntil?.(task);
  } catch {
    void task;
  }
};

const unauthorized = () =>
  Response.json(
    {
      ok: false,
      state: "failed",
      error: {
        code: "unauthorized",
        message: "Missing or invalid executor token.",
      },
    },
    { status: 401 },
  );

const extractAssistantReply = (inputResponse: Record<string, unknown>) => {
  const response = inputResponse.response as
    | { content?: unknown }
    | undefined;

  if (!response || typeof response !== "object") {
    return "";
  }

  if (typeof response.content !== "string") {
    return "";
  }

  const trimmed = response.content.trim();

  if (!trimmed || trimmed.toLowerCase() === "null" || trimmed.toLowerCase() === "undefined") {
    return "";
  }

  return trimmed;
};

const extractTask = (inputResponse: Record<string, unknown>) => {
  const response = inputResponse.response as
    | { type?: unknown; task_status?: unknown; reasoning?: unknown }
    | undefined;
  const execution = inputResponse.execution as
    | { state?: unknown; execution_id?: unknown }
    | undefined;

  if (!response || typeof response !== "object") {
    return {
      thread_id:
        typeof inputResponse.thread_id === "string" ? inputResponse.thread_id : null,
      action: null,
      execution_state:
        execution && typeof execution.state === "string" ? execution.state : null,
      execution_id:
        execution && typeof execution.execution_id === "string"
          ? execution.execution_id
          : null,
      reasoning: null,
    };
  }

  return {
    thread_id:
      typeof inputResponse.thread_id === "string" ? inputResponse.thread_id : null,
    action: typeof response.type === "string" ? response.type : null,
    execution_state:
      execution && typeof execution.state === "string"
        ? execution.state
        : typeof response.task_status === "string"
          ? response.task_status
          : null,
    execution_id:
      execution && typeof execution.execution_id === "string"
        ? execution.execution_id
        : null,
    reasoning:
      typeof response.reasoning === "string" ? response.reasoning : null,
  };
};

const buildAsyncCountdownState = ({
  userId,
  syncResult = null,
  inputResult = null,
}: {
  userId: string;
  syncResult?: Record<string, unknown> | null;
  inputResult?: Record<string, unknown> | null;
}) => ({
  ok: true,
  demo_identity: {
    integration_id: COUNTDOWN_EXECUTOR_ID,
    user_id: userId,
  },
  assistant_reply: "",
  countdowns: getCountdownsForUser(userId),
  observed: {
    sync_status: syncResult ? 200 : null,
    sync_response: syncResult,
    input_status: inputResult ? 200 : null,
    input_response: inputResult,
    delivered_channel_messages: getDeliveredMessages({
      store: countdownDeliveredChannelMessages,
      userId,
    }),
  },
});

export const providerDemoRoutes = [
  route("/sandbox/demo-executor", async ({ request, rw }) => {
    if (request.method !== "GET") {
      return Response.json(
        {
          error: {
            code: "method_not_allowed",
            message: "Method not allowed.",
            details: null,
          },
        },
        { status: 405 },
      );
    }

    return new Response(
      renderHomePage(new URL(request.url).origin).replaceAll(
        "__NONCE__",
        rw.nonce,
      ),
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      },
    );
  }),
  route("/sandbox/demo-executor/playground/texty", async ({ request }) => {
    if (request.method !== "POST") {
      return Response.json(
        {
          error: {
            code: "method_not_allowed",
            message: "Method not allowed.",
            details: null,
          },
        },
        { status: 405 },
      );
    }

    let payload: { token?: string; user_id?: string; text?: string; thread_id?: string | null };

    try {
      payload = (await request.json()) as typeof payload;
    } catch {
      return Response.json(
        {
          ok: false,
          error: {
            code: "invalid_json",
            message: "Request body must be valid JSON.",
          },
        },
        { status: 400 },
      );
    }

    const token = String(payload.token || "").trim();
    const userId = String(payload.user_id || DEMO_USER_ID).trim();
    const text = String(payload.text || "").trim();
    const threadId = typeof payload.thread_id === "string" ? payload.thread_id : null;

    if (!token || token !== DEMO_TOKEN) {
      return unauthorized();
    }

    if (!text) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "missing_text",
            message: "Text input is required.",
          },
        },
        { status: 400 },
      );
    }

    try {
      const existingContext = await loadProviderUserContext({ providerId: DEMO_EXECUTOR_ID, userId });

      if (!existingContext || existingContext.threads.length === 0) {
        await resetProviderUserContext({ providerId: DEMO_EXECUTOR_ID, userId });
      }

      const syncResult = await syncProviderTools(buildSyncBody(userId), undefined, undefined);
      const textyResult = await handleProviderConversationInput({
        input: buildInputBody(userId, text, threadId),
        providerConfig: {
          token: DEMO_TOKEN,
        },
      });

      return Response.json({
        ok: true,
        demo_identity: {
          integration_id: DEMO_EXECUTOR_ID,
          user_id: userId,
        },
        assistant_reply:
          extractAssistantReply(textyResult) ||
          "I need a bit more information before I can continue. Please clarify what should be added to the todo list.",
        task: extractTask(textyResult),
        todos: getBuiltInDemoTodos(userId),
        observed: {
          sync_status: 200,
          sync_response: syncResult,
          input_status: 200,
          input_request: buildInputBody(userId, text, threadId),
          input_response: textyResult,
        },
      });
    } catch (error) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "demo_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        },
        { status: 502 },
      );
    }
  }),
  route("/sandbox/demo-executor/tools/execute", async ({ request }) => {
    if (request.method !== "POST") {
      return Response.json(
        {
          ok: false,
          state: "failed",
          error: {
            code: "method_not_allowed",
            message: "Method not allowed.",
          },
        },
        { status: 405 },
      );
    }

    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";

    if (!token || token !== DEMO_TOKEN) {
      return unauthorized();
    }

    let payload: {
      tool_name?: string;
      user_id?: string;
      arguments?: Record<string, unknown>;
    };

    try {
      payload = (await request.json()) as typeof payload;
    } catch {
      return Response.json(
        {
          ok: false,
          state: "failed",
          error: {
            code: "invalid_json",
            message: "Request body must be valid JSON.",
          },
        },
        { status: 400 },
      );
    }

    const result = executeBuiltInDemoTool({
      toolName: String(payload.tool_name || ""),
      args: payload.arguments ?? {},
      userId: String(payload.user_id || DEMO_USER_ID).trim(),
    });

    return Response.json({
      ok: result.state !== "failed",
      state: result.state,
      result: {
        summary: result.message,
        data: result.data,
      },
      ...(result.state === "failed"
        ? {
            error: {
              code: "execution_failed",
              message: result.message,
            },
          }
        : {}),
    });
  }),
  route("/sandbox/async-countdown", async ({ request, rw }) => {
    if (request.method !== "GET") {
      return Response.json(
        {
          error: {
            code: "method_not_allowed",
            message: "Method not allowed.",
            details: null,
          },
        },
        { status: 405 },
      );
    }

    return new Response(
      renderAsyncCountdownPage(new URL(request.url).origin).replaceAll(
        "__NONCE__",
        rw.nonce,
      ),
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      },
    );
  }),
  route("/sandbox/async-countdown/playground/texty", async ({ request }) => {
    if (request.method === "GET") {
      const requestUrl = new URL(request.url);
      const token = String(requestUrl.searchParams.get("token") || "").trim();
      const userId = String(requestUrl.searchParams.get("user_id") || DEMO_USER_ID).trim();

      if (!token || token !== DEMO_TOKEN) {
        return unauthorized();
      }

      return Response.json(buildAsyncCountdownState({ userId }));
    }

    if (request.method !== "POST") {
      return Response.json(
        {
          error: {
            code: "method_not_allowed",
            message: "Method not allowed.",
            details: null,
          },
        },
        { status: 405 },
      );
    }

    let payload: { token?: string; user_id?: string; text?: string; thread_id?: string | null };

    try {
      payload = (await request.json()) as typeof payload;
    } catch {
      return Response.json(
        {
          ok: false,
          error: {
            code: "invalid_json",
            message: "Request body must be valid JSON.",
          },
        },
        { status: 400 },
      );
    }

    const token = String(payload.token || "").trim();
    const userId = String(payload.user_id || DEMO_USER_ID).trim();
    const text = String(payload.text || "").trim();
    const threadId = typeof payload.thread_id === "string" ? payload.thread_id : null;

    if (!token || token !== DEMO_TOKEN) {
      return unauthorized();
    }

    if (!text) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "missing_text",
            message: "Text input is required.",
          },
        },
        { status: 400 },
      );
    }

    try {
      const existingContext = await loadProviderUserContext({ providerId: COUNTDOWN_EXECUTOR_ID, userId });

      if (!existingContext || existingContext.threads.length === 0) {
        await resetProviderUserContext({ providerId: COUNTDOWN_EXECUTOR_ID, userId });
      }

      const syncResult = await syncProviderTools(buildCountdownSyncBody(userId), undefined, undefined);
      const textyResult = await handleProviderConversationInput({
        input: buildCountdownInputBody(userId, text, threadId),
        providerConfig: {
          token: DEMO_TOKEN,
          baseUrl: `${new URL(request.url).origin}/sandbox/async-countdown`,
        },
      });

      const countdownState = buildAsyncCountdownState({
        userId,
        syncResult,
        inputResult: textyResult,
      });

      return Response.json({
        ...countdownState,
        assistant_reply: extractAssistantReply(textyResult),
        task: extractTask(textyResult),
        observed: {
          ...countdownState.observed,
          input_request: buildCountdownInputBody(userId, text, threadId),
        },
      });
    } catch (error) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "demo_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        },
        { status: 502 },
      );
    }
  }),
  route("/sandbox/async-countdown/tools/execute", async ({ request }) => {
    if (request.method !== "POST") {
      return Response.json(
        {
          ok: false,
          state: "failed",
          error: {
            code: "method_not_allowed",
            message: "Method not allowed.",
          },
        },
        { status: 405 },
      );
    }

    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";

    if (!token || token !== DEMO_TOKEN) {
      return unauthorized();
    }

    let payload: Record<string, unknown>;

    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json(
        {
          ok: false,
          state: "failed",
          error: {
            code: "invalid_json",
            message: "Request body must be valid JSON.",
          },
        },
        { status: 400 },
      );
    }

    const result = executeCountdownToolCall({
      payload,
      defaultUserId: DEMO_USER_ID,
    });

    const callbackUrl =
      typeof payload.context === "object" &&
      payload.context &&
      typeof (payload.context as Record<string, unknown>).executor_result_webhook_url ===
        "string"
        ? String(
            (payload.context as Record<string, unknown>).executor_result_webhook_url,
          ).trim()
        : "";

    if (callbackUrl && (result.state === "accepted" || result.state === "in_progress")) {
      const executionId = String(payload.execution_id || "").trim();
      const userId = String(payload.user_id || DEMO_USER_ID).trim();
      const threadId = String(payload.thread_id || "").trim();
      const toolName = String(payload.tool_name || "").trim();
      const channel =
        typeof payload.context === "object" &&
        payload.context &&
        typeof (payload.context as Record<string, unknown>).channel === "object"
          ? ((payload.context as Record<string, unknown>).channel as Record<string, unknown>)
          : null;

      scheduleBackgroundTask(
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, COUNTDOWN_SECONDS * 1000));

          const completedCountdown = markCountdownComplete({
            userId,
            executionId,
            completedAt: new Date().toISOString(),
          });

          await fetch(callbackUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${DEMO_TOKEN}`,
              "Content-Type": "application/json",
              ...(executionId ? { "Idempotency-Key": executionId } : {}),
            },
            body: JSON.stringify({
              integration_id: COUNTDOWN_EXECUTOR_ID,
              user_id: userId,
              thread_id: threadId,
              channel:
                channel &&
                typeof channel.type === "string" &&
                typeof channel.id === "string"
                  ? {
                      type: channel.type,
                      id: channel.id,
                    }
                  : undefined,
              result: {
                execution_id: executionId || undefined,
                tool_name: toolName || undefined,
                state: "completed",
                content:
                  completedCountdown?.completion_message || "Countdown complete.",
                data: {
                  seconds: COUNTDOWN_SECONDS,
                  completed_at:
                    completedCountdown?.completed_at || new Date().toISOString(),
                },
              },
            }),
          });
        })(),
      );
    }

    return Response.json(result, {
      status: result.state === "failed" ? 400 : 200,
    });
  }),
  route("/sandbox/async-countdown/channels/messages", async ({ request }) => {
    if (request.method !== "POST") {
      return Response.json(
        {
          error: {
            code: "method_not_allowed",
            message: "Method not allowed.",
            details: null,
          },
        },
        { status: 405 },
      );
    }

    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";

    if (!token || token !== DEMO_TOKEN) {
      return unauthorized();
    }

    let payload: Record<string, unknown>;

    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json(
        {
          ok: false,
          error: {
            code: "invalid_json",
            message: "Request body must be valid JSON.",
          },
        },
        { status: 400 },
      );
    }

    appendDeliveredMessage({
      store: countdownDeliveredChannelMessages,
      userId: String(payload.user_id || DEMO_USER_ID).trim(),
      payload,
    });

    return Response.json({
      ok: true,
      delivered: true,
    });
  }),
  route("/sandbox/pinned-tool", async ({ request, rw }) => {
    if (request.method !== "GET") {
      return Response.json(
        {
          error: {
            code: "method_not_allowed",
            message: "Method not allowed.",
            details: null,
          },
        },
        { status: 405 },
      );
    }

    return new Response(
      renderPinnedToolPage(new URL(request.url).origin).replaceAll(
        "__NONCE__",
        rw.nonce,
      ),
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      },
    );
  }),
  route("/sandbox/pinned-tool/playground/texty", async ({ request }) => {
    if (request.method !== "POST") {
      return Response.json(
        {
          error: {
            code: "method_not_allowed",
            message: "Method not allowed.",
            details: null,
          },
        },
        { status: 405 },
      );
    }

    let payload: { token?: string; user_id?: string; text?: string; thread_id?: string | null };

    try {
      payload = (await request.json()) as typeof payload;
    } catch {
      return Response.json(
        {
          ok: false,
          error: {
            code: "invalid_json",
            message: "Request body must be valid JSON.",
          },
        },
        { status: 400 },
      );
    }

    const token = String(payload.token || "").trim();
    const userId = String(payload.user_id || DEMO_USER_ID).trim();
    const text = String(payload.text || "").trim();
    const threadId = typeof payload.thread_id === "string" ? payload.thread_id : null;

    if (!token || token !== DEMO_TOKEN) {
      return unauthorized();
    }

    if (!text) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "missing_text",
            message: "Text input is required.",
          },
        },
        { status: 400 },
      );
    }

    try {
      const existingContext = await loadProviderUserContext({ providerId: PINNED_TOOL_EXECUTOR_ID, userId });

      if (!existingContext || existingContext.threads.length === 0) {
        await resetProviderUserContext({ providerId: PINNED_TOOL_EXECUTOR_ID, userId });
      }

      const syncResult = await syncProviderTools(buildPinnedToolSyncBody(userId), undefined, undefined);
      const textyResult = await handleProviderConversationInput({
        input: buildPinnedToolInputBody(userId, text, threadId),
        providerConfig: {
          token: DEMO_TOKEN,
          baseUrl: `${new URL(request.url).origin}/sandbox/pinned-tool`,
        },
      });

      return Response.json({
        ok: true,
        demo_identity: {
          integration_id: PINNED_TOOL_EXECUTOR_ID,
          user_id: userId,
        },
        thread_id: textyResult.thread_id ?? null,
        transcript: {
          user: text,
          assistant: textyResult.response?.content ?? "",
        },
        response: textyResult.response ?? null,
        execution: textyResult.execution ?? null,
        captured: {
          notes: getToolEntriesForUser({
            toolName: "notes.capture",
            userId,
          }),
          ideas: getToolEntriesForUser({
            toolName: "ideas.capture",
            userId,
          }),
        },
        observed: {
          sync_status: 200,
          sync_response: syncResult,
          input_status: 200,
          input_request: buildPinnedToolInputBody(userId, text, threadId),
          input_response: textyResult,
          delivered_channel_messages: getDeliveredMessages({
            store: pinnedToolDeliveredChannelMessages,
            userId,
          }),
        },
      });
    } catch (error) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "demo_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        },
        { status: 502 },
      );
    }
  }),
  route("/sandbox/pinned-tool/tools/execute", async ({ request }) => {
    if (request.method !== "POST") {
      return Response.json(
        {
          ok: false,
          state: "failed",
          error: {
            code: "method_not_allowed",
            message: "Method not allowed.",
          },
        },
        { status: 405 },
      );
    }

    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";

    if (!token || token !== DEMO_TOKEN) {
      return unauthorized();
    }

    let payload: Record<string, unknown>;

    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json(
        {
          ok: false,
          state: "failed",
          error: {
            code: "invalid_json",
            message: "Request body must be valid JSON.",
          },
        },
        { status: 400 },
      );
    }

    const result = executePinnedToolCall({
      payload,
      defaultUserId: DEMO_USER_ID,
    });

    return Response.json(result, {
      status: result.state === "failed" ? 400 : 200,
    });
  }),
  route("/sandbox/demo-executor/debug", async ({ request }) => {
    if (!import.meta.env.VITE_IS_DEV_SERVER) {
      return Response.json({ error: "Not available in production." }, { status: 403 });
    }
    const userId = new URL(request.url).searchParams.get("user_id") ?? DEMO_USER_ID;
    const context = await loadProviderUserContext({ providerId: DEMO_EXECUTOR_ID, userId });

    return Response.json({
      integration_id: DEMO_EXECUTOR_ID,
      user_id: userId,
      context: context ?? null,
    });
  }),
  route("/sandbox/async-countdown/debug", async ({ request }) => {
    if (!import.meta.env.VITE_IS_DEV_SERVER) {
      return Response.json({ error: "Not available in production." }, { status: 403 });
    }
    const userId = new URL(request.url).searchParams.get("user_id") ?? DEMO_USER_ID;
    const context = await loadProviderUserContext({ providerId: COUNTDOWN_EXECUTOR_ID, userId });

    return Response.json({
      integration_id: COUNTDOWN_EXECUTOR_ID,
      user_id: userId,
      context: context ?? null,
    });
  }),
  route("/sandbox/pinned-tool/debug", async ({ request }) => {
    if (!import.meta.env.VITE_IS_DEV_SERVER) {
      return Response.json({ error: "Not available in production." }, { status: 403 });
    }
    const userId = new URL(request.url).searchParams.get("user_id") ?? DEMO_USER_ID;
    const context = await loadProviderUserContext({ providerId: PINNED_TOOL_EXECUTOR_ID, userId });

    return Response.json({
      integration_id: PINNED_TOOL_EXECUTOR_ID,
      user_id: userId,
      context: context ?? null,
    });
  }),
  route("/sandbox/demo-executor/reset", async ({ request }) => {
    if (!import.meta.env.VITE_IS_DEV_SERVER) {
      return Response.json({ error: "Not available in production." }, { status: 403 });
    }
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed." }, { status: 405 });
    }

    const userId = new URL(request.url).searchParams.get("user_id") ?? DEMO_USER_ID;
    await deleteProviderUserContext({ providerId: DEMO_EXECUTOR_ID, userId });
    return Response.json({ ok: true, reset: true, integration_id: DEMO_EXECUTOR_ID, user_id: userId });
  }),
  route("/sandbox/async-countdown/reset", async ({ request }) => {
    if (!import.meta.env.VITE_IS_DEV_SERVER) {
      return Response.json({ error: "Not available in production." }, { status: 403 });
    }
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed." }, { status: 405 });
    }

    const userId = new URL(request.url).searchParams.get("user_id") ?? DEMO_USER_ID;
    await deleteProviderUserContext({ providerId: COUNTDOWN_EXECUTOR_ID, userId });
    return Response.json({ ok: true, reset: true, integration_id: COUNTDOWN_EXECUTOR_ID, user_id: userId });
  }),
  route("/sandbox/pinned-tool/reset", async ({ request }) => {
    if (!import.meta.env.VITE_IS_DEV_SERVER) {
      return Response.json({ error: "Not available in production." }, { status: 403 });
    }
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed." }, { status: 405 });
    }

    const userId = new URL(request.url).searchParams.get("user_id") ?? DEMO_USER_ID;
    await deleteProviderUserContext({ providerId: PINNED_TOOL_EXECUTOR_ID, userId });
    return Response.json({ ok: true, reset: true, integration_id: PINNED_TOOL_EXECUTOR_ID, user_id: userId });
  }),
];
