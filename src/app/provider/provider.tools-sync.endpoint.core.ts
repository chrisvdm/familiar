import type { ProviderToolSyncInput, ProviderUserContext } from "./provider.types.ts";

type AuthResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      status: number;
      error: {
        code: string;
        message: string;
      };
    };

type ProviderRateLimitShape = {
  retryAfterSeconds: number;
};

export type ToolsSyncEndpointDeps = {
  getRequestId: (request: Request) => string;
  getIdempotencyHeader: (request: Request) => string | null;
  readJson: <T>(request: Request) => Promise<T>;
  jsonResponse: (input: {
    requestId: string;
    body: Record<string, unknown>;
    status?: number;
    retryAfterSeconds?: number;
    idempotentReplay?: boolean;
  }) => Response;
  jsonError: (input: {
    requestId: string;
    status: number;
    code: string;
    message: string;
    details?: unknown;
    retryAfterSeconds?: number;
  }) => Response;
  replayIdempotentResponse: (input: {
    requestId: string;
    replay: {
      status: number;
      body: Record<string, unknown>;
    };
  }) => Response;
  authenticateProviderRequest: (input: {
    request: Request;
    providerId: string;
    requestId: string;
  }) => AuthResult;
  loadOrCreateProviderUserContext: (input: {
    providerId: string;
    userId: string;
  }) => Promise<ProviderUserContext>;
  saveProviderUserContext: (
    context: ProviderUserContext,
  ) => Promise<ProviderUserContext>;
  buildIdempotencyKey: (input: {
    method: string;
    path: string;
    idempotencyKey: string;
  }) => string;
  hashIdempotencyRequest: (input: {
    method: string;
    path: string;
    body: unknown;
  }) => Promise<string>;
  readIdempotencyReplay: (input: {
    context: ProviderUserContext;
    storageKey: string;
    requestHash: string;
  }) =>
    | { kind: "miss" }
    | { kind: "conflict" }
    | { kind: "replay"; status: number; body: Record<string, unknown> };
  storeIdempotencyReplay: (input: {
    context: ProviderUserContext;
    storageKey: string;
    requestHash: string;
    status: number;
    body: Record<string, unknown>;
    now?: string;
  }) => ProviderUserContext;
  syncProviderTools: (
    input: ProviderToolSyncInput,
    requestId?: string,
  ) => Promise<Record<string, unknown>>;
  isProviderRateLimitError: (
    error: unknown,
  ) => error is Error & ProviderRateLimitShape;
};

export const createHandleToolsSyncEndpoint = (deps: ToolsSyncEndpointDeps) => {
  return async ({
    request,
    params,
  }: {
    request: Request;
    params: {
      integrationId: string;
      userId: string;
    };
  }) => {
    const requestId = deps.getRequestId(request);

    if (request.method !== "POST") {
      return deps.jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    const auth = deps.authenticateProviderRequest({
      request,
      providerId: params.integrationId,
      requestId,
    });

    if (!auth.ok) {
      return deps.jsonError({
        requestId,
        status: auth.status,
        code: auth.error.code,
        message: auth.error.message,
      });
    }

    try {
      const input = await deps.readJson<ProviderToolSyncInput>(request);
      const idempotencyKey = deps.getIdempotencyHeader(request);

      if (
        input.integration_id !== params.integrationId ||
        input.user_id !== params.userId
      ) {
        return deps.jsonError({
          requestId,
          status: 403,
          code: "forbidden",
          message: "Integration or user mismatch.",
        });
      }

      if (idempotencyKey) {
        const context = await deps.loadOrCreateProviderUserContext({
          providerId: input.integration_id,
          userId: input.user_id,
        });
        const storageKey = deps.buildIdempotencyKey({
          method: request.method,
          path: `/api/v1/integrations/${params.integrationId}/users/${params.userId}/tools/sync`,
          idempotencyKey,
        });
        const requestHash = await deps.hashIdempotencyRequest({
          method: request.method,
          path: storageKey,
          body: input,
        });
        const replay = deps.readIdempotencyReplay({
          context,
          storageKey,
          requestHash,
        });

        if (replay.kind === "replay") {
          return deps.replayIdempotentResponse({ requestId, replay });
        }

        if (replay.kind === "conflict") {
          return deps.jsonError({
            requestId,
            status: 409,
            code: "idempotency_conflict",
            message: "Idempotency key was reused with a different request body.",
          });
        }

        const result = await deps.syncProviderTools(input, requestId);
        const nextContext = deps.storeIdempotencyReplay({
          context: await deps.loadOrCreateProviderUserContext({
            providerId: input.integration_id,
            userId: input.user_id,
          }),
          storageKey,
          requestHash,
          status: 200,
          body: result,
        });
        await deps.saveProviderUserContext(nextContext);

        return deps.jsonResponse({
          requestId,
          body: result,
        });
      }

      const result = await deps.syncProviderTools(input, requestId);
      return deps.jsonResponse({
        requestId,
        body: result,
      });
    } catch (error) {
      if (deps.isProviderRateLimitError(error)) {
        return deps.jsonError({
          requestId,
          status: 429,
          code: "rate_limited",
          message: "Too many tool sync requests. Try again shortly.",
          details: {
            retry_after_seconds: error.retryAfterSeconds,
          },
          retryAfterSeconds: error.retryAfterSeconds,
        });
      }

      return deps.jsonError({
        requestId,
        status: 400,
        code: "invalid_request",
        message:
          error instanceof Error ? error.message : "Invalid request payload.",
      });
    }
  };
};
