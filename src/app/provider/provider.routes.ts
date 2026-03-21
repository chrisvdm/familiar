import { route } from "rwsdk/router";

import { authenticateProviderRequest } from "./provider-auth";
import { handleConversationInputEndpoint } from "./provider.conversation.endpoint";
import {
  getIdempotencyHeader,
  getRequestId,
  jsonError,
  jsonResponse,
  readJson,
  replayIdempotentResponse,
} from "./provider.http";
import {
  buildIdempotencyKey,
  hashIdempotencyRequest,
  readIdempotencyReplay,
  storeIdempotencyReplay,
} from "./provider.idempotency";
import {
  createProviderThread,
  deleteProviderThread,
  getProviderMemory,
  getProviderThreadMemory,
  listProviderThreads,
  renameProviderThread,
  syncProviderTools,
} from "./provider.service";
import {
  loadOrCreateProviderUserContext,
  saveProviderUserContext,
} from "./provider.storage";
import type {
  ProviderToolSyncInput,
} from "./provider.types";

export const providerRoutes = [
  route(
    "/api/v1/providers/:providerId/users/:userId/tools/sync",
    async ({ request, params }) => {
      const requestId = getRequestId(request);

      if (request.method !== "POST") {
        return jsonError({
          requestId,
          status: 405,
          code: "method_not_allowed",
          message: "Method not allowed.",
        });
      }

      const auth = authenticateProviderRequest({
        request,
        providerId: params.providerId,
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
        const input = await readJson<ProviderToolSyncInput>(request);
        const idempotencyKey = getIdempotencyHeader(request);

        if (
          input.provider_id !== params.providerId ||
          input.user_id !== params.userId
        ) {
          return jsonError({
            requestId,
            status: 403,
            code: "forbidden",
            message: "Provider or user mismatch.",
          });
        }

        if (idempotencyKey) {
          const context = await loadOrCreateProviderUserContext({
            providerId: input.provider_id,
            userId: input.user_id,
          });
          const storageKey = buildIdempotencyKey({
            method: request.method,
            path: `/api/v1/providers/${params.providerId}/users/${params.userId}/tools/sync`,
            idempotencyKey,
          });
          const requestHash = await hashIdempotencyRequest({
            method: request.method,
            path: storageKey,
            body: input,
          });
          const replay = readIdempotencyReplay({
            context,
            storageKey,
            requestHash,
          });

          if (replay.kind === "replay") {
            return replayIdempotentResponse({ requestId, replay });
          }

          if (replay.kind === "conflict") {
            return jsonError({
              requestId,
              status: 409,
              code: "idempotency_conflict",
              message: "Idempotency key was reused with a different request body.",
            });
          }

          const result = await syncProviderTools(input, requestId);
          const nextContext = storeIdempotencyReplay({
            context: await loadOrCreateProviderUserContext({
              providerId: input.provider_id,
              userId: input.user_id,
            }),
            storageKey,
            requestHash,
            status: 200,
            body: result as unknown as Record<string, unknown>,
          });
          await saveProviderUserContext(nextContext);

          return jsonResponse({
            requestId,
            body: result as unknown as Record<string, unknown>,
          });
        }

        const result = await syncProviderTools(input, requestId);
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
            error instanceof Error ? error.message : "Invalid request payload.",
        });
      }
    },
  ),
  route("/api/v1/conversation/input", handleConversationInputEndpoint),
  route("/api/v1/threads", async ({ request }) => {
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
      const input = await readJson<{
        provider_id: string;
        user_id: string;
        title?: string;
        is_private?: boolean;
        channel: {
          type: string;
          id: string;
        };
      }>(request);
      const idempotencyKey = getIdempotencyHeader(request);
      const auth = authenticateProviderRequest({
        request,
        providerId: input.provider_id,
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

      if (idempotencyKey) {
        const context = await loadOrCreateProviderUserContext({
          providerId: input.provider_id,
          userId: input.user_id,
        });
        const storageKey = buildIdempotencyKey({
          method: request.method,
          path: "/api/v1/threads",
          idempotencyKey,
        });
        const requestHash = await hashIdempotencyRequest({
          method: request.method,
          path: storageKey,
          body: input,
        });
        const replay = readIdempotencyReplay({
          context,
          storageKey,
          requestHash,
        });

        if (replay.kind === "replay") {
          return replayIdempotentResponse({ requestId, replay });
        }

        if (replay.kind === "conflict") {
          return jsonError({
            requestId,
            status: 409,
            code: "idempotency_conflict",
            message: "Idempotency key was reused with a different request body.",
          });
        }

        const result = await createProviderThread({
          providerId: input.provider_id,
          userId: input.user_id,
          title: input.title,
          isPrivate: input.is_private,
          channel: input.channel,
          requestId,
        });
        const nextContext = storeIdempotencyReplay({
          context: await loadOrCreateProviderUserContext({
            providerId: input.provider_id,
            userId: input.user_id,
          }),
          storageKey,
          requestHash,
          status: 200,
          body: result as unknown as Record<string, unknown>,
        });
        await saveProviderUserContext(nextContext);

        return jsonResponse({
          requestId,
          body: result as unknown as Record<string, unknown>,
        });
      }

      const result = await createProviderThread({
        providerId: input.provider_id,
        userId: input.user_id,
        title: input.title,
        isPrivate: input.is_private,
        channel: input.channel,
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
          error instanceof Error ? error.message : "Invalid request payload.",
      });
    }
  }),
  route(
    "/api/v1/providers/:providerId/users/:userId/threads",
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

      const auth = authenticateProviderRequest({
        request,
        providerId: params.providerId,
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
          providerId: params.providerId,
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
  route("/api/v1/threads/:threadId", async ({ request, params }) => {
    const requestId = getRequestId(request);

    if (request.method !== "PATCH" && request.method !== "DELETE") {
      return jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    try {
      const input = await readJson<{
        provider_id: string;
        user_id: string;
        title?: string;
      }>(request);
      const idempotencyKey = getIdempotencyHeader(request);
      const auth = authenticateProviderRequest({
        request,
        providerId: input.provider_id,
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

      const storageKey = idempotencyKey
        ? buildIdempotencyKey({
            method: request.method,
            path: `/api/v1/threads/${params.threadId}`,
            idempotencyKey,
          })
        : null;
      const requestHash =
        idempotencyKey && storageKey
          ? await hashIdempotencyRequest({
              method: request.method,
              path: storageKey,
              body: input,
            })
          : null;
      const context =
        idempotencyKey && storageKey && requestHash
          ? await loadOrCreateProviderUserContext({
              providerId: input.provider_id,
              userId: input.user_id,
            })
          : null;
      const replay =
        context && storageKey && requestHash
          ? readIdempotencyReplay({
              context,
              storageKey,
              requestHash,
            })
          : null;

      if (replay?.kind === "replay") {
        return replayIdempotentResponse({ requestId, replay });
      }

      if (replay?.kind === "conflict") {
        return jsonError({
          requestId,
          status: 409,
          code: "idempotency_conflict",
          message: "Idempotency key was reused with a different request body.",
        });
      }

      if (request.method === "PATCH") {
        const result = await renameProviderThread({
          providerId: input.provider_id,
          userId: input.user_id,
          threadId: params.threadId,
          title: input.title ?? "",
          requestId,
        });

        if (context && storageKey && requestHash) {
          await saveProviderUserContext(
            storeIdempotencyReplay({
              context: await loadOrCreateProviderUserContext({
                providerId: input.provider_id,
                userId: input.user_id,
              }),
              storageKey,
              requestHash,
              status: 200,
              body: result as unknown as Record<string, unknown>,
            }),
          );
        }

        return jsonResponse({
          requestId,
          body: result as unknown as Record<string, unknown>,
        });
      }

      const result = await deleteProviderThread({
        providerId: input.provider_id,
        userId: input.user_id,
        threadId: params.threadId,
        requestId,
      });

      if (context && storageKey && requestHash) {
        await saveProviderUserContext(
          storeIdempotencyReplay({
            context: await loadOrCreateProviderUserContext({
              providerId: input.provider_id,
              userId: input.user_id,
            }),
            storageKey,
            requestHash,
            status: 200,
            body: result as unknown as Record<string, unknown>,
          }),
        );
      }

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
          error instanceof Error ? error.message : "Invalid request payload.",
      });
    }
  }),
  route(
    "/api/v1/providers/:providerId/users/:userId/memory",
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

      const auth = authenticateProviderRequest({
        request,
        providerId: params.providerId,
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
          providerId: params.providerId,
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
      const providerId = url.searchParams.get("provider_id")?.trim();
      const userId = url.searchParams.get("user_id")?.trim();

      if (!providerId || !userId) {
        throw new Error("provider_id and user_id are required.");
      }

      const auth = authenticateProviderRequest({
        request,
        providerId,
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
        providerId,
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
];
