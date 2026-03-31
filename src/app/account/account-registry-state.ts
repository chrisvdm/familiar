import type { FamiliarAccountRegistryState } from "./account.types";

export const createInitialRegistryState = (): FamiliarAccountRegistryState => ({
  accounts: {},
  integrations: {},
  tokens: {},
  tokenIndex: {},
});

export const normalizeAccountRegistryState = (
  state: Partial<FamiliarAccountRegistryState> | null | undefined,
): FamiliarAccountRegistryState => ({
  accounts:
    state?.accounts && typeof state.accounts === "object" ? state.accounts : {},
  integrations:
    state?.integrations && typeof state.integrations === "object"
      ? state.integrations
      : {},
  tokens: state?.tokens && typeof state.tokens === "object" ? state.tokens : {},
  tokenIndex:
    state?.tokenIndex && typeof state.tokenIndex === "object"
      ? state.tokenIndex
      : {},
});
