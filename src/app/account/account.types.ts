export type FamiliarAccount = {
  id: string;
  defaultSetupId: string;
  actionCount: number;
  createdAt: string;
};

export type FamiliarIntegrationConfig = {
  id: string;
  accountId: string;
  name: string;
  baseUrl: string | null;
  aiApiKey: string | null;
  toolUrls: Record<string, string>;
  webhookSecret: string;
  transport: "webhook" | "websocket";
  createdAt: string;
  updatedAt: string;
};

export type FamiliarApiToken = {
  id: string;
  accountId: string;
  prefix: string;
  lastFour: string;
  tokenHash: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type FamiliarBrowserLoginSession = {
  code: string;
  tokenValue: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
};

export type FamiliarUser = {
  id: string;
  email: string;
  passwordHash: string;
  accountId: string;
  apiTokenValue: string;
  createdAt: string;
};

export type FamiliarContactSubmission = {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
};

export type FamiliarAccountRegistryState = {
  accounts: Record<string, FamiliarAccount>;
  integrations: Record<string, FamiliarIntegrationConfig>;
  tokens: Record<string, FamiliarApiToken>;
  tokenIndex: Record<string, string>;
  browserLoginSessions: Record<string, FamiliarBrowserLoginSession>;
  users: Record<string, FamiliarUser>;
  emailIndex: Record<string, string>;
  contactSubmissions: Record<string, FamiliarContactSubmission>;
  rateLimits: Record<string, string[]>;
};

export type FamiliarTokenAuth = {
  account: FamiliarAccount;
  integration: FamiliarIntegrationConfig;
  token: FamiliarApiToken;
};
