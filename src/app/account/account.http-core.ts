import { integrationPatchSchema } from "../provider/provider.schemas.ts";

type CreateAccountResult = {

  account: {
    id: string;
    createdAt: string;
  };
  integration: {
    id: string;
    baseUrl: string | null;
    aiApiKey: string | null;
    createdAt: string;
    updatedAt: string;
  };
  token: {
    value: string;
    prefix: string;
    lastFour: string;
    createdAt: string;
  };
};

type AuthenticatedAccount = {
  account: {
    id: string;
    defaultSetupId: string;
    createdAt: string;
  };
  integration: {
    id: string;
    baseUrl: string | null;
    aiApiKey: string | null;
    transport: "webhook" | "websocket";
    createdAt: string;
    updatedAt: string;
  };
  token: {
    id: string;
    prefix: string;
    lastFour: string;
    createdAt: string;
    lastUsedAt: string | null;
  };
};

export type AccountEndpointDeps = {
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
  authenticateAccountToken: (
    token: string,
  ) => Promise<AuthenticatedAccount | null>;
  createAccountWithInitialToken: (input: {
  }) => Promise<CreateAccountResult>;
  normalizeIntegrationBaseUrl: (baseUrl: string) => string;
  updateAccountIntegrationBaseUrl: (input: {
    accountId: string;
    integrationId: string;
    baseUrl: string | null;
    aiApiKey: string | null;
    transport?: "webhook" | "websocket";
  }) => Promise<{
    id: string;
    baseUrl: string | null;
    aiApiKey: string | null;
    transport: "webhook" | "websocket";
    createdAt: string;
    updatedAt: string;
  }>;
  syncProviderTools: (
    input: {
      integration_id: string;
      user_id: string;
      tools: Array<{
        tool_name: string;
        description: string;
        input_schema: Record<string, unknown>;
        input_mode?: "processed" | "raw";
        executor_payload?: unknown;
        policy?: Record<string, unknown>;
        status?: "active" | "disabled";
        base_url?: string;
      }>;
    },
    requestId?: string,
    accountId?: string,
  ) => Promise<Record<string, unknown>>;
  createBrowserLoginSession: (token: string) => Promise<{ code: string; expiresAt: string }>;
  getAccountUsage: (accountId: string) => Promise<{
    actionCount: number;
    freeActionsRemaining: number;
  }>;
  getIntegrationStatus: (input: {
    accountId: string;
    integrationId: string;
  }) => Promise<{
    toolCount: number;
    threadCount: number;
  }>;
  checkRateLimitByIp: (input: {
    request: Request;
    action: string;
    maxRequests: number;
    windowMs: number;
  }) => Promise<{ allowed: boolean; retryAfterSeconds?: number }>;
};

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
};

export const createHandleCreateAccountEndpoint = (deps: AccountEndpointDeps) => {
  return async ({ request }: { request: Request }) => {
    const requestId = deps.getRequestId(request);

    if (request.method !== "POST") {
      return deps.jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    const rateLimit = await deps.checkRateLimitByIp({
      request,
      action: "create_account",
      maxRequests: 5,
      windowMs: 60 * 60 * 1_000,
    });

    if (!rateLimit.allowed) {
      return deps.jsonError({
        requestId,
        status: 429,
        code: "rate_limited",
        message: "Too many account creation attempts. Try again later.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
    }

    try {
      const body = await deps.readJson<{
        base_url?: string;
        ai_api_key?: string;
        tools?: Array<{
          tool_name: string;
          description: string;
          input_schema: Record<string, unknown>;
          input_mode?: "processed" | "raw";
          executor_payload?: unknown;
          policy?: Record<string, unknown>;
          status?: "active" | "disabled";
          base_url?: string;
        }>;
      }>(request);

      const result = await deps.createAccountWithInitialToken({});

      let integration = result.integration;

      if (body.base_url || body.ai_api_key !== undefined) {
        const normalizedBaseUrl = body.base_url
          ? deps.normalizeIntegrationBaseUrl(body.base_url)
          : null;
        integration = await deps.updateAccountIntegrationBaseUrl({
          accountId: result.account.id,
          integrationId: result.integration.id,
          baseUrl: normalizedBaseUrl,
          aiApiKey: body.ai_api_key ?? null,
        });
      }

      let toolsSyncResult: Record<string, unknown> | undefined;

      if (body.tools && body.tools.length > 0) {
        toolsSyncResult = await deps.syncProviderTools(
          {
            integration_id: result.integration.id,
            user_id: "default",
            tools: body.tools,
          },
          requestId,
          result.account.id,
        );
      }

      return deps.jsonResponse({
        requestId,
        status: 201,
        body: {
          account: {
            id: result.account.id,
            created_at: result.account.createdAt,
          },
          token: {
            value: result.token.value,
            prefix: result.token.prefix,
            last_four: result.token.lastFour,
            created_at: result.token.createdAt,
          },
          integration: {
            id: integration.id,
            base_url: integration.baseUrl,
            ai_api_key_set: !!integration.aiApiKey,
            created_at: integration.createdAt,
          },
          ...(toolsSyncResult
            ? {
                tools: {
                  synced: toolsSyncResult.synced_tools,
                  status: toolsSyncResult.status,
                },
              }
            : {}),
        },
      });
    } catch (error) {
      return deps.jsonError({
        requestId,
        status: 400,
        code: "invalid_request",
        message:
          error instanceof Error ? error.message : "Invalid account creation request.",
      });
    }
  };
};

export const createHandleGetAccountEndpoint = (deps: AccountEndpointDeps) => {
  return async ({ request }: { request: Request }) => {
    const requestId = deps.getRequestId(request);

    if (request.method !== "GET") {
      return deps.jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    const token = getBearerToken(request);

    if (!token) {
      return deps.jsonError({
        requestId,
        status: 401,
        code: "unauthenticated",
        message: "Missing bearer token.",
      });
    }

    const auth = await deps.authenticateAccountToken(token);

    if (!auth) {
      return deps.jsonError({
        requestId,
        status: 403,
        code: "forbidden",
        message: "Invalid API token.",
      });
    }

    return deps.jsonResponse({
      requestId,
      body: {
        account: {
          id: auth.account.id,
          created_at: auth.account.createdAt,
        },
        setup: {
          id: auth.account.defaultSetupId,
          base_url: auth.integration.baseUrl,
        },
        token: {
          id: auth.token.id,
          prefix: auth.token.prefix,
          last_four: auth.token.lastFour,
          created_at: auth.token.createdAt,
          last_used_at: auth.token.lastUsedAt,
        },
      },
    });
  };
};

export const createHandleCurrentIntegrationEndpoint = (
  deps: AccountEndpointDeps,
) => {
  return async ({ request }: { request: Request }) => {
    const requestId = deps.getRequestId(request);

    if (request.method !== "GET" && request.method !== "PATCH") {
      return deps.jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    const token = getBearerToken(request);

    if (!token) {
      return deps.jsonError({
        requestId,
        status: 401,
        code: "unauthenticated",
        message: "Missing bearer token.",
      });
    }

    const auth = await deps.authenticateAccountToken(token);

    if (!auth) {
      return deps.jsonError({
        requestId,
        status: 403,
        code: "forbidden",
        message: "Invalid API token.",
      });
    }

    if (request.method === "GET") {
      return deps.jsonResponse({
        requestId,
        body: {
          integration: {
            id: auth.integration.id,
            base_url: auth.integration.baseUrl,
            ai_api_key_set: auth.integration.aiApiKey !== null,
            ai_api_key_prefix: auth.integration.aiApiKey
              ? auth.integration.aiApiKey.slice(0, 8)
              : null,
            transport: auth.integration.transport,
            created_at: auth.integration.createdAt,
            updated_at: auth.integration.updatedAt,
          },
        },
      });
    }

    try {
      const body = await deps.readJson<Record<string, unknown>>(request);
      const parsed = integrationPatchSchema.safeParse(body);

      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        return deps.jsonError({
          requestId,
          status: 400,
          code: "invalid_request",
          message: issues,
        });
      }

      const input = parsed.data;

      const normalizedBaseUrl =
        input.base_url == null ? null : deps.normalizeIntegrationBaseUrl(input.base_url);

      // --GROK--: ai_api_key absent means keep current value; null means clear it; string means set it
      const incomingAiApiKey = "ai_api_key" in body ? input.ai_api_key : undefined;

      // --GROK--: when ai_api_key is absent from the payload, preserve the existing value
      const resolvedAiApiKey =
        incomingAiApiKey !== undefined ? incomingAiApiKey : auth.integration.aiApiKey;

      // --GROK--: when transport is absent from the payload, preserve the existing value
      const resolvedTransport =
        input.transport !== undefined ? input.transport : auth.integration.transport;

      const integration = await deps.updateAccountIntegrationBaseUrl({
        accountId: auth.account.id,
        integrationId: auth.integration.id,
        baseUrl: normalizedBaseUrl,
        aiApiKey: resolvedAiApiKey ?? null,
        transport: resolvedTransport,
      });

      return deps.jsonResponse({
        requestId,
        body: {
          integration: {
            id: integration.id,
            base_url: integration.baseUrl,
            ai_api_key_set: integration.aiApiKey !== null,
            ai_api_key_prefix: integration.aiApiKey
              ? integration.aiApiKey.slice(0, 8)
              : null,
            transport: integration.transport,
            created_at: integration.createdAt,
            updated_at: integration.updatedAt,
          },
        },
      });
    } catch (error) {
      return deps.jsonError({
        requestId,
        status: 400,
        code: "invalid_request",
        message:
          error instanceof Error
            ? error.message
            : "Invalid integration configuration request.",
      });
    }
  };
};

export const createHandleCreateBrowserSessionEndpoint = (deps: AccountEndpointDeps) => {
  return async ({ request }: { request: Request }) => {
    const requestId = deps.getRequestId(request);

    if (request.method !== "POST") {
      return deps.jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    const token = getBearerToken(request);

    if (!token) {
      return deps.jsonError({
        requestId,
        status: 401,
        code: "unauthenticated",
        message: "Missing bearer token.",
      });
    }

    try {
      const session = await deps.createBrowserLoginSession(token);
      return deps.jsonResponse({
        requestId,
        body: { code: session.code, expires_at: session.expiresAt },
      });
    } catch (error) {
      return deps.jsonError({
        requestId,
        status: 403,
        code: "forbidden",
        message: error instanceof Error ? error.message : "Invalid API token.",
      });
    }
  };
};

export const createHandleIntegrationStatusEndpoint = (
  deps: AccountEndpointDeps,
) => {
  return async ({ request }: { request: Request }) => {
    const requestId = deps.getRequestId(request);

    if (request.method !== "GET") {
      return deps.jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    const token = getBearerToken(request);

    if (!token) {
      return deps.jsonError({
        requestId,
        status: 401,
        code: "unauthenticated",
        message: "Missing bearer token.",
      });
    }

    const auth = await deps.authenticateAccountToken(token);

    if (!auth) {
      return deps.jsonError({
        requestId,
        status: 403,
        code: "forbidden",
        message: "Invalid API token.",
      });
    }

    const runtime = await deps.getIntegrationStatus({
      accountId: auth.account.id,
      integrationId: auth.integration.id,
    });

    return deps.jsonResponse({
      requestId,
      body: {
        integration: {
          id: auth.integration.id,
          base_url: auth.integration.baseUrl,
          ai_api_key_set: auth.integration.aiApiKey !== null,
          ai_api_key_prefix: auth.integration.aiApiKey
            ? auth.integration.aiApiKey.slice(0, 8)
            : null,
          created_at: auth.integration.createdAt,
          updated_at: auth.integration.updatedAt,
        },
        account: {
          id: auth.account.id,
        },
        runtime: {
          tool_count: runtime.toolCount,
          thread_count: runtime.threadCount,
        },
      },
    });
  };
};



export const createHandleAccountUsageEndpoint = (deps: AccountEndpointDeps) => {
  return async ({ request }: { request: Request }) => {
    const requestId = deps.getRequestId(request);

    if (request.method !== "GET") {
      return deps.jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    const token = getBearerToken(request);
    if (!token) {
      return deps.jsonError({
        requestId,
        status: 401,
        code: "unauthenticated",
        message: "Missing bearer token.",
      });
    }

    const auth = await deps.authenticateAccountToken(token);
    if (!auth) {
      return deps.jsonError({
        requestId,
        status: 403,
        code: "forbidden",
        message: "Invalid API token.",
      });
    }

    const usage = await deps.getAccountUsage(auth.account.id);

    return deps.jsonResponse({
      requestId,
      body: {
        account_id: auth.account.id,
        action_count: usage.actionCount,
        free_actions_remaining: usage.freeActionsRemaining,
      },
    });
  };
};

