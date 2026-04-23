export type FamiliarAccount = {
  id: string;
  defaultSetupId: string;
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

export type FamiliarAccountRegistryState = {
  accounts: Record<string, FamiliarAccount>;
  integrations: Record<string, FamiliarIntegrationConfig>;
  tokens: Record<string, FamiliarApiToken>;
  tokenIndex: Record<string, string>;
};

export type FamiliarTokenAuth = {
  account: FamiliarAccount;
  integration: FamiliarIntegrationConfig;
  token: FamiliarApiToken;
};
