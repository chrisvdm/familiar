import { getRequestId, jsonError, jsonResponse } from "../provider/provider.http.ts";

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
};

const serializeToken = (token: {
  id: string;
  accountId: string;
  prefix: string;
  lastFour: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}) => ({
  id: token.id,
  prefix: token.prefix,
  last_four: token.lastFour,
  created_at: token.createdAt,
  last_used_at: token.lastUsedAt,
  revoked_at: token.revokedAt,
});

type TokenInfo = {
  id: string;
  accountId: string;
  prefix: string;
  lastFour: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type AuthenticatedAccount = {
  account: { id: string };
  integration: { id: string };
};

export type TokensEndpointDeps = {
  getRequestId: (request: Request) => string;
  authenticateAccountToken: (token: string) => Promise<AuthenticatedAccount | null>;
  listAccountTokens: (accountId: string) => Promise<TokenInfo[]>;
  createAccountToken: (accountId: string) => Promise<{ value: string; token: TokenInfo }>;
  revokeAccountToken: (input: { accountId: string; tokenId: string }) => Promise<TokenInfo>;
};

export const createHandleTokensEndpoint = (deps: TokensEndpointDeps) => {
  return async ({ request }: { request: Request }) => {
    const requestId = deps.getRequestId(request);

    const token = getBearerToken(request);
    if (!token) {
      return jsonError({
        requestId,
        status: 401,
        code: "unauthenticated",
        message: "Missing bearer token.",
      });
    }

    const auth = await deps.authenticateAccountToken(token);
    if (!auth) {
      return jsonError({
        requestId,
        status: 403,
        code: "forbidden",
        message: "Invalid API token.",
      });
    }

    if (request.method === "GET") {
      const tokens = await deps.listAccountTokens(auth.account.id);

      return jsonResponse({
        requestId,
        body: {
          tokens: tokens.map(serializeToken),
        },
      });
    }

    if (request.method === "POST") {
      const result = await deps.createAccountToken(auth.account.id);

      return jsonResponse({
        requestId,
        status: 201,
        body: {
          token: {
            value: result.value,
            ...serializeToken(result.token),
          },
        },
      });
    }

    return jsonError({
      requestId,
      status: 405,
      code: "method_not_allowed",
      message: "Method not allowed.",
    });
  };
};

export const createHandleRevokeTokenEndpoint = (deps: TokensEndpointDeps) => {
  return async ({
    request,
    params,
  }: {
    request: Request;
    params: { tokenId?: string };
  }) => {
    const requestId = deps.getRequestId(request);

    if (request.method !== "DELETE") {
      return jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    const token = getBearerToken(request);
    if (!token) {
      return jsonError({
        requestId,
        status: 401,
        code: "unauthenticated",
        message: "Missing bearer token.",
      });
    }

    const auth = await deps.authenticateAccountToken(token);
    if (!auth) {
      return jsonError({
        requestId,
        status: 403,
        code: "forbidden",
        message: "Invalid API token.",
      });
    }

    const tokenId = params.tokenId;
    if (!tokenId) {
      return jsonError({
        requestId,
        status: 400,
        code: "invalid_request",
        message: "token_id is required.",
      });
    }

    const revoked = await deps.revokeAccountToken({
      accountId: auth.account.id,
      tokenId,
    });

    return jsonResponse({
      requestId,
      body: {
        token: serializeToken(revoked),
      },
    });
  };
};
