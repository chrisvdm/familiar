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
  }) => Promise<{
    id: string;
    baseUrl: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
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
            created_at: auth.integration.createdAt,
            updated_at: auth.integration.updatedAt,
          },
        },
      });
    }

    try {
      const input = await deps.readJson<{ base_url?: string | null }>(request);
      const normalizedBaseUrl =
        input.base_url == null ? null : deps.normalizeIntegrationBaseUrl(input.base_url);
      const integration = await deps.updateAccountIntegrationBaseUrl({
        accountId: auth.account.id,
        integrationId: auth.integration.id,
        baseUrl: normalizedBaseUrl,
      });

      return deps.jsonResponse({
        requestId,
        body: {
          integration: {
            id: integration.id,
            base_url: integration.baseUrl,
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
