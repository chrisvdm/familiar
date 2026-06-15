import type { ProviderUserContext } from "./provider.types.ts";
import { providerToolSchema } from "./provider.schemas.ts";
import {
  resolveProviderIdFromInput,
  resolveUserIdFromInput,
} from "./provider.endpoint-input.ts";

type AuthResult =
  | {
      ok: true;
      providerId: string;
      accountId?: string;
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

export type ToolAddEndpointDeps = {
  getRequestId: (request: Request) => string;
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
  authenticateProviderRequest: (input: {
    request: Request;
    providerId?: string;
    requestId: string;
  }) => AuthResult | Promise<AuthResult>;
  loadOrCreateProviderUserContext: (input: {
    providerId: string;
    userId: string;
  }) => Promise<ProviderUserContext>;
  addProviderTool: (
    input: {
      integration_id: string;
      user_id: string;
      tool: {
        tool_name: string;
        description: string;
        input_schema: Record<string, unknown>;
        input_mode?: "processed" | "raw";
        executor_payload?: unknown;
        policy?: Record<string, unknown>;
        status?: "active" | "disabled";
        base_url?: string;
      };
    },
    requestId?: string,
    accountId?: string,
  ) => Promise<Record<string, unknown>>;
  isProviderRateLimitError: (
    error: unknown,
  ) => error is Error & ProviderRateLimitShape;
};

export const createHandleToolAddEndpoint = (deps: ToolAddEndpointDeps) => {
  return async ({
    request,
    params,
  }: {
    request: Request;
    params: {
      integrationId?: string;
      userId?: string;
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

    const auth = await deps.authenticateProviderRequest({
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
      const raw = await deps.readJson<{
        integration_id?: string;
        user_id?: string;
        tool?: Record<string, unknown>;
      }>(request);

      const parsedTool = providerToolSchema.safeParse(raw.tool);

      if (!parsedTool.success) {
        const issues = parsedTool.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        return deps.jsonError({
          requestId,
          status: 400,
          code: "invalid_request",
          message: issues,
        });
      }

      const providerId = resolveProviderIdFromInput({
        explicitProviderId: raw.integration_id ?? params.integrationId,
        authenticatedProviderId: auth.providerId,
      });
      const userId = resolveUserIdFromInput({
        explicitUserId: raw.user_id,
        authenticatedAccountId: auth.accountId,
      });

      if (params.integrationId && providerId !== params.integrationId) {
        return deps.jsonError({
          requestId,
          status: 403,
          code: "forbidden",
          message: "Integration mismatch.",
        });
      }

      if (params.userId && userId !== params.userId) {
        return deps.jsonError({
          requestId,
          status: 403,
          code: "forbidden",
          message: "User mismatch.",
        });
      }

      const result = await deps.addProviderTool(
        {
          integration_id: providerId,
          user_id: userId,
          tool: parsedTool.data,
        },
        requestId,
        auth.accountId,
      );

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
          message: "Too many tool add requests. Try again shortly.",
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
        message: error instanceof Error ? error.message : "Invalid request payload.",
      });
    }
  };
};
