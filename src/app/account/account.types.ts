export type FamiliarAccount = {
  id: string;
  defaultSetupId: string;
  actionCount: number;
  freeActionsUsed: number;
  plan: "free" | "paid";
  createdAt: string;
};

export type FamiliarIntegrationConfig = {
  id: string;
  accountId: string;
  baseUrl: string | null;
  aiApiKey: string | null;
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

export type FamiliarCliSession = {
  sessionId: string;
  tokenValue?: string;
  expiresAt: string;
};

export type FamiliarAccountRegistryState = {
  accounts: Record<string, FamiliarAccount>;
  integrations: Record<string, FamiliarIntegrationConfig>;
  tokens: Record<string, FamiliarApiToken>;
  tokenIndex: Record<string, string>;
  cliSessions: Record<string, FamiliarCliSession>;
};

export type FamiliarTokenAuth = {
  account: FamiliarAccount;
  integration: FamiliarIntegrationConfig;
  token: FamiliarApiToken;
};
