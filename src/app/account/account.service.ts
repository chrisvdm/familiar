import { env } from "cloudflare:workers";

import type {
  FamiliarAccount,
  FamiliarApiToken,
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
