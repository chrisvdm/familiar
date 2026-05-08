import { env } from "cloudflare:workers";

import { loadProviderUserContext } from "../provider/provider.storage";
import type {
  FamiliarAccount,
  FamiliarApiToken,
  FamiliarCliSession,
  FamiliarIntegrationConfig,
  FamiliarTokenAuth,
} from "./account.types";

type AccountRegistryStub = {
  createAccount: (input: {
    account: FamiliarAccount;
    integration: FamiliarIntegrationConfig;
    token: FamiliarApiToken;
  }) => Promise<{
    account: FamiliarAccount;
    integration: FamiliarIntegrationConfig;
    token: FamiliarApiToken;
  }>;
  updateIntegration: (input: {
    integrationId: string;
    accountId: string;
    baseUrl: string | null;
    aiApiKey: string | null;
  }) => Promise<{ value: FamiliarIntegrationConfig } | { error: string }>;
  authenticateToken: (input: {
    tokenHash: string;
  }) => Promise<{ value: FamiliarTokenAuth } | { error: string }>;
  createCliSession: (input: {
    sessionId: string;
  }) => Promise<{ value: FamiliarCliSession }>;
  completeCliSession: (input: {
    sessionId: string;
    tokenValue: string;
  }) => Promise<{ value: "ok" } | { error: string }>;
  pollCliSession: (input: {
    sessionId: string;
  }) => Promise<
    | { state: "pending" }
    | { state: "completed"; tokenValue: string }
    | { state: "expired" }
  >;
  incrementActionCount: (input: {
    accountId: string;
  }) => Promise<{ value: { actionCount: number; freeActionsUsed: number; freeActionsRemaining: number | null; plan: "free" | "paid" } } | { error: string }>;
  getAccountUsage: (input: {
    accountId: string;
  }) => Promise<{ value: { actionCount: number; freeActionsUsed: number; freeActionsRemaining: number | null; plan: "free" | "paid" } } | { error: string }>;
};

const accountEnv = env as typeof env & {
  ACCOUNT_REGISTRY: DurableObjectNamespace;
};

const encoder = new TextEncoder();

const getAccountRegistryStub = () => {
  const id = accountEnv.ACCOUNT_REGISTRY.idFromName("account-registry");
  return accountEnv.ACCOUNT_REGISTRY.get(id) as unknown as AccountRegistryStub;
};

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

const randomHex = (length: number) =>
  toHex(crypto.getRandomValues(new Uint8Array(Math.ceil(length / 2)))).slice(
    0,
    length,
  );

export const hashApiToken = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return toHex(new Uint8Array(digest));
};

const createApiTokenValue = () => `fam_${randomHex(48)}`;

const createAccountId = () => `acct_${randomHex(24)}`;

const createSetupId = () => `setup_${randomHex(24)}`;

export const normalizeIntegrationBaseUrl = (rawBaseUrl: string) => {
  const trimmed = rawBaseUrl.trim();

  if (!trimmed) {
    throw new Error("Executor base URL must not be empty.");
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Executor base URL is not a valid URL: ${trimmed}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Executor base URL must use http or https: ${trimmed}`);
  }

  if (parsed.search || parsed.hash) {
    throw new Error(
      `Executor base URL must not include query or hash: ${trimmed}`,
    );
  }

  return parsed.toString().replace(/\/$/, "");
};

const createTokenRecord = async ({
  accountId,
}: {
  accountId: string;
}) => {
  const value = createApiTokenValue();
  const createdAt = new Date().toISOString();

  const token: FamiliarApiToken = {
    id: `tok_${randomHex(24)}`,
    accountId,
    prefix: value.slice(0, 8),
    lastFour: value.slice(-4),
    tokenHash: await hashApiToken(value),
    createdAt,
    lastUsedAt: null,
    revokedAt: null,
  };

  return {
    value,
    token,
  };
};

export const createAccountWithInitialToken = async ({
}: {
}) => {
  const setupId = createSetupId();
  const account: FamiliarAccount = {
    id: createAccountId(),
    defaultSetupId: setupId,
    actionCount: 0,
    freeActionsUsed: 0,
    plan: "free",
    createdAt: new Date().toISOString(),
  };
  const integration: FamiliarIntegrationConfig = {
    id: setupId,
    accountId: account.id,
    baseUrl: null,
    aiApiKey: null,
    createdAt: account.createdAt,
    updatedAt: account.createdAt,
  };
  const { value, token } = await createTokenRecord({
    accountId: account.id,
  });

  const result = await getAccountRegistryStub().createAccount({
    account,
    integration,
    token,
  });

  return {
    account: result.account,
    integration: result.integration,
    token: {
      ...result.token,
      value,
    },
  };
};

export const authenticateAccountToken = async (token: string) => {
  const result = await getAccountRegistryStub().authenticateToken({
    tokenHash: await hashApiToken(token),
  });

  if ("error" in result) {
    return null;
  }

  return result.value;
};

export const updateAccountIntegrationBaseUrl = async ({
  accountId,
  integrationId,
  baseUrl,
  aiApiKey,
}: {
  accountId: string;
  integrationId: string;
  baseUrl: string | null;
  aiApiKey: string | null;
}) => {
  const result = await getAccountRegistryStub().updateIntegration({
    accountId,
    integrationId,
    baseUrl,
    aiApiKey,
  });

  if ("error" in result) {
    throw new Error(result.error);
  }

  return result.value;
};

export const createCliSession = async () => {
  const sessionId = `cli_${randomHex(32)}`;
  const result = await getAccountRegistryStub().createCliSession({ sessionId });
  return result.value;
};

export const completeCliSession = async (sessionId: string, rawToken: string) => {
  const auth = await authenticateAccountToken(rawToken);
  if (!auth) {
    return { error: "Token not found." } as const;
  }
  return getAccountRegistryStub().completeCliSession({ sessionId, tokenValue: rawToken });
};

export const pollCliSession = async (sessionId: string) => {
  return getAccountRegistryStub().pollCliSession({ sessionId });
};

export const incrementAccountActionCount = async (accountId: string) => {
  const result = await getAccountRegistryStub().incrementActionCount({ accountId });
  if ("error" in result) {
    throw new Error(result.error);
  }
  return result.value;
};

export const getAccountUsage = async (accountId: string) => {
  const result = await getAccountRegistryStub().getAccountUsage({ accountId });
  if ("error" in result) {
    throw new Error(result.error);
  }
  return result.value;
};

export const getIntegrationStatus = async ({
  integrationId,
}: {
  accountId: string;
  integrationId: string;
}) => {
  const context = await loadProviderUserContext({
    providerId: integrationId,
    userId: "default",
  });

  return {
    toolCount: context?.allowedTools.filter((t) => t.status === "active").length ?? 0,
    threadCount: context?.threads.length ?? 0,
  };
};
