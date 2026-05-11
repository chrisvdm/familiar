import { env } from "cloudflare:workers";

import { loadProviderUserContext } from "../provider/provider.storage";
import type {
  FamiliarAccount,
  FamiliarApiToken,
  FamiliarCliSession,
  FamiliarIntegrationConfig,
  FamiliarTokenAuth,
  FamiliarUser,
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
    baseUrl?: string | null;
    aiApiKey?: string | null;
    toolUrls?: Record<string, string>;
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
  listAccountIntegrations: (input: {
    accountId: string;
  }) => Promise<{ value: FamiliarIntegrationConfig[] } | { error: string }>;
  createUser: (input: {
    user: FamiliarUser;
  }) => Promise<{ value: FamiliarUser } | { error: string }>;
  getUserByEmail: (input: {
    email: string;
  }) => Promise<{ value: FamiliarUser } | { error: string }>;
  storeContactSubmission: (input: {
    submission: Record<string, unknown>;
  }) => Promise<{ value: Record<string, unknown> } | { error: string }>;
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
    name: "Default Integration",
    baseUrl: null,
    aiApiKey: null,
    toolUrls: {},
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

export const updateIntegrationToolUrls = async ({
  accountId,
  integrationId,
  toolUrls,
}: {
  accountId: string;
  integrationId: string;
  toolUrls: Record<string, string>;
}) => {
  const result = await getAccountRegistryStub().updateIntegration({
    accountId,
    integrationId,
    toolUrls,
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

export const listAccountIntegrations = async (accountId: string) => {
  const result = await getAccountRegistryStub().listAccountIntegrations({ accountId });
  if ("error" in result) {
    throw new Error(result.error);
  }
  return result.value;
};

const hexToBytes = (hex: string): ArrayBuffer => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

export const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  const saltHex = toHex(salt);
  const keyHex = toHex(new Uint8Array(derivedBits));
  return `${saltHex}:${keyHex}`;
};

export const verifyPassword = async (
  password: string,
  storedHash: string,
): Promise<boolean> => {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [saltHex, keyHex] = parts;
  const salt = hexToBytes(saltHex);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  const derivedHex = toHex(new Uint8Array(derivedBits));
  return derivedHex === keyHex;
};

export const registerAccountUser = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await getAccountRegistryStub().getUserByEmail({
    email: normalizedEmail,
  });
  if ("value" in existing) {
    return { error: "Email already registered." } as const;
  }

  const passwordHash = await hashPassword(password);
  const result = await createAccountWithInitialToken({});

  const user: FamiliarUser = {
    id: `usr_${randomHex(24)}`,
    email: normalizedEmail,
    passwordHash,
    accountId: result.account.id,
    apiTokenValue: result.token.value,
    createdAt: new Date().toISOString(),
  };

  const created = await getAccountRegistryStub().createUser({ user });
  if ("error" in created) {
    return { error: created.error } as const;
  }

  return { value: { user: created.value, token: result.token.value } } as const;
};

export const authenticateUser = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  const result = await getAccountRegistryStub().getUserByEmail({
    email: email.trim().toLowerCase(),
  });

  if ("error" in result) {
    return { error: "Invalid email or password." } as const;
  }

  const valid = await verifyPassword(password, result.value.passwordHash);
  if (!valid) {
    return { error: "Invalid email or password." } as const;
  }

  return { value: result.value } as const;
};

export const storeContactSubmission = async ({
  name,
  email,
  message,
}: {
  name: string;
  email: string;
  message: string;
}) => {
  const submission = {
    id: `msg_${randomHex(24)}`,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    message: message.trim(),
    createdAt: new Date().toISOString(),
  };

  const result = await getAccountRegistryStub().storeContactSubmission({
    submission,
  });

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
