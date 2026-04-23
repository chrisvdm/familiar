import type { FamiliarAccountRegistryState } from "./account.types";

export const createInitialRegistryState = (): FamiliarAccountRegistryState => ({
  accounts: {},
  integrations: {},
  tokens: {},
  tokenIndex: {},
});

const normalizeIntegrationRecord = (
  record: Record<string, unknown>,
): import("./account.types").FamiliarIntegrationConfig => ({
  id: record.id as string,
  accountId: record.accountId as string,
  baseUrl: (record.baseUrl as string | null) ?? null,
  aiApiKey: (record.aiApiKey as string | null) ?? null,
  createdAt: record.createdAt as string,
  updatedAt: record.updatedAt as string,
});

export const normalizeAccountRegistryState = (
  state: Partial<FamiliarAccountRegistryState> | null | undefined,
): FamiliarAccountRegistryState => ({
  accounts:
    state?.accounts && typeof state.accounts === "object" ? state.accounts : {},
  integrations:
    state?.integrations && typeof state.integrations === "object"
      ? Object.fromEntries(
          Object.entries(state.integrations).map(([k, v]) => [
            k,
            normalizeIntegrationRecord(v as Record<string, unknown>),
          ]),
        )
      : {},
  tokens: state?.tokens && typeof state.tokens === "object" ? state.tokens : {},
  tokenIndex:
    state?.tokenIndex && typeof state.tokenIndex === "object"
      ? state.tokenIndex
      : {},
});
