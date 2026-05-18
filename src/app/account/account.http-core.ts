type CreateAccountResult = {
  account: {
    id: string;
    createdAt: string;
  };
  integration: {
    id: string;
    baseUrl: string | null;
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

type AccountEndpointDeps = {
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
  }) => Promise<{
    id: string;
    baseUrl: string | null;
    aiApiKey: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  createBrowserLoginSession: (token: string) => Promise<{ code: string; expiresAt: string }>;
  getAccountUsage: (accountId: string) => Promise<{
    actionCount: number;
    freeActionsUsed: number;
    freeActionsRemaining: number | null;
    plan: "free" | "paid";
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
      await deps.readJson<Record<string, never> | undefined>(request);
      const result = await deps.createAccountWithInitialToken({});

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
        plan: usage.plan,
        action_count: usage.actionCount,
        free_actions_used: usage.freeActionsUsed,
        free_actions_remaining: usage.freeActionsRemaining,
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
            created_at: auth.integration.createdAt,
            updated_at: auth.integration.updatedAt,
          },
        },
      });
    }

    try {
      const input = await deps.readJson<{
        base_url?: string | null;
        ai_api_key?: string | null;
      }>(request);

      const normalizedBaseUrl =
        input.base_url == null ? null : deps.normalizeIntegrationBaseUrl(input.base_url);

      // --GROK--: ai_api_key absent means keep current value; null means clear it; string means set it
      const incomingAiApiKey = "ai_api_key" in input ? input.ai_api_key : undefined;
      if (incomingAiApiKey !== undefined && incomingAiApiKey !== null) {
        if (!incomingAiApiKey.startsWith("sk-or-v1-")) {
          return deps.jsonError({
            requestId,
            status: 400,
            code: "invalid_request",
            message: "Unrecognised API key format. Expected an OpenRouter key starting with sk-or-v1-.",
          });
        }
      }

      // --GROK--: when ai_api_key is absent from the payload, preserve the existing value
      const resolvedAiApiKey =
        incomingAiApiKey !== undefined ? incomingAiApiKey : auth.integration.aiApiKey;

      const integration = await deps.updateAccountIntegrationBaseUrl({
        accountId: auth.account.id,
        integrationId: auth.integration.id,
        baseUrl: normalizedBaseUrl,
        aiApiKey: resolvedAiApiKey ?? null,
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

    const usage = await deps.getAccountUsage(auth.account.id);
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
          plan: usage.plan,
          action_count: usage.actionCount,
          free_actions_used: usage.freeActionsUsed,
          free_actions_remaining: usage.freeActionsRemaining,
        },
        runtime: {
          tool_count: runtime.toolCount,
          thread_count: runtime.threadCount,
        },
      },
    });
  };
};


