import { route } from "rwsdk/router";

import { authenticateProviderRequest } from "./provider-auth";
import { handleConversationInputEndpoint } from "./provider.conversation.endpoint";
import { handleExecutorResultEndpoint } from "./provider.executor-result.endpoint";
import { handleThreadCreateEndpoint } from "./provider.thread-create.endpoint";
import { handleThreadMutationEndpoint } from "./provider.thread-mutation.endpoint";
import { handleToolsSyncEndpoint } from "./provider.tools-sync.endpoint";
import {
  getRequestId,
  jsonError,
  jsonResponse,
} from "./provider.http";
import {
  getProviderHealth,
  getProviderMemory,
  getProviderThreadMemory,
  handleStreamConversationInput,
  listProviderThreads,
  simulateConversationInput,
} from "./provider.service";
import { loadOrCreateProviderUserContext } from "./provider.storage";

export const providerRoutes = [
  route("/api/v1/tools/sync", handleToolsSyncEndpoint),
  route("/api/v1/users/:userId/tools/sync", handleToolsSyncEndpoint),
  route(
    "/api/v1/integrations/:integrationId/users/:userId/tools/sync",
    handleToolsSyncEndpoint,
  ),
  route("/api/v1/input", handleConversationInputEndpoint),
  route("/api/v1/conversation/input", handleConversationInputEndpoint),
  route("/api/v1/input/stream", async ({ request }) => {
    const requestId = getRequestId(request);

    if (request.method !== "POST") {
      return jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    try {
      const body = await request.json() as {
        input?: { text?: string };
        channel?: { type: string; id: string };
        thread_id?: string;
        tools?: unknown;
        model?: string;
        timezone?: string;
        user_id?: string;
        integration_id?: string;
      };
      const auth = await authenticateProviderRequest({ request, requestId });

      if (!auth.ok) {
        return jsonError({
          requestId,
          status: auth.status,
          code: auth.error.code,
          message: auth.error.message,
        });
      }

      const result = await handleStreamConversationInput({
        input: {
          integration_id: auth.providerId,
          user_id: body.user_id ?? "default",
          input: { kind: "text" as const, text: body.input?.text ?? "" },
          channel: body.channel ?? { type: "web", id: "stream" },
          ...(body.thread_id ? { thread_id: body.thread_id } : {}),
          ...(body.tools ? { tools: body.tools as unknown[] } : {}),
          ...(body.model ? { model: body.model } : {}),
          ...(body.timezone ? { timezone: body.timezone } : {}),
        } as any,
        providerConfig: auth.providerConfig,
        requestId,
      });

      return new Response(result.stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Request-Id": requestId,
        },
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "retryAfterSeconds" in error &&
        typeof error.retryAfterSeconds === "number"
      ) {
        return jsonError({
          requestId,
          status: 429,
          code: "rate_limited",
          message: "Too many conversation requests. Try again shortly.",
          details: { retry_after_seconds: error.retryAfterSeconds },
          retryAfterSeconds: error.retryAfterSeconds,
        });
      }

      return jsonError({
        requestId,
        status: 400,
        code: "invalid_request",
        message:
          error instanceof Error ? error.message : "Invalid stream request.",
      });
    }
  }),
  route("/api/v1/input/simulate", async ({ request }) => {
    const requestId = getRequestId(request);

    if (request.method !== "POST") {
      return jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    try {
      const body = await request.json() as {
        input?: { text?: string };
        channel?: { type: string; id: string };
        thread_id?: string;
        tools?: unknown;
        model?: string;
        timezone?: string;
      };
      const auth = await authenticateProviderRequest({ request, requestId });

      if (!auth.ok) {
        return jsonError({
          requestId,
          status: auth.status,
          code: auth.error.code,
          message: auth.error.message,
        });
      }

      const result = await simulateConversationInput({
        input: {
          integration_id: auth.providerId,
          user_id: "default",
          input: { kind: "text" as const, text: body.input?.text ?? "" },
          channel: body.channel ?? { type: "web", id: "simulate" },
          ...(body.thread_id ? { thread_id: body.thread_id } : {}),
          ...(body.tools ? { tools: body.tools as unknown[] } : {}),
          ...(body.model ? { model: body.model } : {}),
          ...(body.timezone ? { timezone: body.timezone } : {}),
        } as any,
        providerConfig: { token: "" },
        requestId,
      });

      return jsonResponse({
        requestId,
        body: result as unknown as Record<string, unknown>,
      });
    } catch (error) {
      return jsonError({
        requestId,
        status: 400,
        code: "invalid_request",
        message:
          error instanceof Error ? error.message : "Invalid simulate request.",
      });
    }
  }),
  route("/api/v1/webhooks/executor", handleExecutorResultEndpoint),
  route("/api/v1/threads", async ({ request, params }) => {
    if (request.method === "POST") {
      return handleThreadCreateEndpoint({ request });
    }

    if (request.method === "PATCH" || request.method === "DELETE") {
      return handleThreadMutationEndpoint({ request, params });
    }

    const requestId = getRequestId(request);
    return jsonError({
      requestId,
      status: 405,
      code: "method_not_allowed",
      message: "Method not allowed.",
    });
  }),
  route("/api/v1/users/:userId/threads", async ({ request, params }) => {
    const requestId = getRequestId(request);

    if (request.method !== "GET") {
      return jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    const auth = await authenticateProviderRequest({
      request,
      requestId,
    });

    if (!auth.ok) {
      return jsonError({
        requestId,
        status: auth.status,
        code: auth.error.code,
        message: auth.error.message,
      });
    }

    try {
      const result = await listProviderThreads({
        providerId: auth.providerId,
        userId: params.userId,
      });
      return jsonResponse({
        requestId,
        body: result as unknown as Record<string, unknown>,
      });
    } catch (error) {
      return jsonError({
        requestId,
        status: 400,
        code: "invalid_request",
        message:
          error instanceof Error ? error.message : "Unable to list threads.",
      });
    }
  }),
  route(
    "/api/v1/integrations/:integrationId/users/:userId/threads",
    async ({ request, params }) => {
      const requestId = getRequestId(request);

      if (request.method !== "GET") {
        return jsonError({
          requestId,
          status: 405,
          code: "method_not_allowed",
          message: "Method not allowed.",
        });
      }

      const auth = await authenticateProviderRequest({
        request,
        providerId: params.integrationId,
        requestId,
      });

      if (!auth.ok) {
        return jsonError({
          requestId,
          status: auth.status,
          code: auth.error.code,
          message: auth.error.message,
        });
      }

      try {
        const result = await listProviderThreads({
          providerId: params.integrationId,
          userId: params.userId,
        });
        return jsonResponse({
          requestId,
          body: result as unknown as Record<string, unknown>,
        });
      } catch (error) {
        return jsonError({
          requestId,
          status: 400,
          code: "invalid_request",
          message:
            error instanceof Error ? error.message : "Unable to list threads.",
        });
      }
    },
  ),
  route("/api/v1/threads/:threadId", handleThreadMutationEndpoint),
  route("/api/v1/users/:userId/memory", async ({ request, params }) => {
    const requestId = getRequestId(request);

    if (request.method !== "GET") {
      return jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    const auth = await authenticateProviderRequest({
      request,
      requestId,
    });

    if (!auth.ok) {
      return jsonError({
        requestId,
        status: auth.status,
        code: auth.error.code,
        message: auth.error.message,
      });
    }

    try {
      const result = await getProviderMemory({
        providerId: auth.providerId,
        userId: params.userId,
      });
      return jsonResponse({
        requestId,
        body: result as unknown as Record<string, unknown>,
      });
    } catch (error) {
      return jsonError({
        requestId,
        status: 400,
        code: "invalid_request",
        message:
          error instanceof Error ? error.message : "Unable to load memory.",
      });
    }
  }),
  route(
    "/api/v1/integrations/:integrationId/users/:userId/memory",
    async ({ request, params }) => {
      const requestId = getRequestId(request);

      if (request.method !== "GET") {
        return jsonError({
          requestId,
          status: 405,
          code: "method_not_allowed",
          message: "Method not allowed.",
        });
      }

      const auth = await authenticateProviderRequest({
        request,
        providerId: params.integrationId,
        requestId,
      });

      if (!auth.ok) {
        return jsonError({
          requestId,
          status: auth.status,
          code: auth.error.code,
          message: auth.error.message,
        });
      }

      try {
        const result = await getProviderMemory({
          providerId: params.integrationId,
          userId: params.userId,
        });
        return jsonResponse({
          requestId,
          body: result as unknown as Record<string, unknown>,
        });
      } catch (error) {
        return jsonError({
          requestId,
          status: 400,
          code: "invalid_request",
          message:
            error instanceof Error ? error.message : "Unable to load memory.",
        });
      }
    },
  ),
  route("/api/v1/threads/:threadId/memory", async ({ request, params }) => {
    const requestId = getRequestId(request);

    if (request.method !== "GET") {
      return jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("user_id")?.trim();

      if (!userId) {
        throw new Error("user_id is required.");
      }

      const auth = await authenticateProviderRequest({
        request,
        providerId: url.searchParams.get("integration_id")?.trim(),
        requestId,
      });

      if (!auth.ok) {
        return jsonError({
          requestId,
          status: auth.status,
          code: auth.error.code,
          message: auth.error.message,
        });
      }

      const result = await getProviderThreadMemory({
        providerId: auth.providerId,
        userId,
        threadId: params.threadId,
      });

      return jsonResponse({
        requestId,
        body: result as unknown as Record<string, unknown>,
      });
    } catch (error) {
      return jsonError({
        requestId,
        status: 400,
        code: "invalid_request",
        message:
          error instanceof Error ? error.message : "Unable to load thread memory.",
      });
    }
  }),
  route("/api/v1/integration/health", async ({ request }) => {
    const requestId = getRequestId(request);

    if (request.method !== "GET") {
      return jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    try {
      const auth = await authenticateProviderRequest({ request, requestId });

      if (!auth.ok) {
        return jsonError({
          requestId,
          status: auth.status,
          code: auth.error.code,
          message: auth.error.message,
        });
      }

      const result = await getProviderHealth({
        providerId: auth.providerId,
        userId: "default",
        providerConfig: auth.providerConfig,
      });

      return jsonResponse({
        requestId,
        body: result,
      });
    } catch (error) {
      return jsonError({
        requestId,
        status: 400,
        code: "invalid_request",
        message:
          error instanceof Error ? error.message : "Unable to load health.",
      });
    }
  }),
  route("/api/v1/audit/events", async ({ request }) => {
    const requestId = getRequestId(request);

    if (request.method !== "GET") {
      return jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    const auth = await authenticateProviderRequest({ request, requestId });

    if (!auth.ok) {
      return jsonError({
        requestId,
        status: auth.status,
        code: auth.error.code,
        message: auth.error.message,
      });
    }

    try {
      const url = new URL(request.url);
      const statusFilter = url.searchParams.get("status");
      const limit = Math.min(
        parseInt(url.searchParams.get("limit") ?? "50", 10),
        100,
      );

      const context = await loadOrCreateProviderUserContext({
        providerId: auth.providerId,
        userId: "default",
      });

      let events = context.auditLog ?? [];
      if (statusFilter) {
        events = events.filter((e) => e.status === statusFilter);
      }
      events = events.slice(-limit);

      return jsonResponse({
        requestId,
        body: { events },
      });
    } catch (error) {
      return jsonError({
        requestId,
        status: 400,
        code: "invalid_request",
        message:
          error instanceof Error ? error.message : "Unable to load audit events.",
      });
    }
  }),
];
