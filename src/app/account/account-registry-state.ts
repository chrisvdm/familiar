import type { FamiliarAccountRegistryState } from "./account.types";

export const createInitialRegistryState = (): FamiliarAccountRegistryState => ({
  accounts: {},
  integrations: {},
  tokens: {},
  tokenIndex: {},
  cliSessions: {},
  users: {},
  emailIndex: {},
  contactSubmissions: {},
});

const normalizeAccountRecord = (
  record: Record<string, unknown>,
): import("./account.types").FamiliarAccount => ({
  id: record.id as string,
  defaultSetupId: record.defaultSetupId as string,
  actionCount: typeof record.actionCount === "number" ? record.actionCount : 0,
  freeActionsUsed: typeof record.freeActionsUsed === "number" ? record.freeActionsUsed : 0,
  plan: (record.plan as "free" | "paid") || "free",
  createdAt: record.createdAt as string,
});

const normalizeIntegrationRecord = (
  record: Record<string, unknown>,
): import("./account.types").FamiliarIntegrationConfig => ({
  id: record.id as string,
  accountId: record.accountId as string,
  name: (record.name as string) || "Integration",
  baseUrl: (record.baseUrl as string | null) ?? null,
  aiApiKey: (record.aiApiKey as string | null) ?? null,
  toolUrls:
    record.toolUrls && typeof record.toolUrls === "object"
      ? (record.toolUrls as Record<string, string>)
      : {},
  createdAt: record.createdAt as string,
  updatedAt: record.updatedAt as string,
});

const normalizeUserRecord = (
  record: Record<string, unknown>,
): import("./account.types").FamiliarUser => ({
  id: record.id as string,
  email: record.email as string,
  passwordHash: record.passwordHash as string,
  accountId: record.accountId as string,
  apiTokenValue: record.apiTokenValue as string,
  createdAt: record.createdAt as string,
});

export const normalizeAccountRegistryState = (
  state: Partial<FamiliarAccountRegistryState> | null | undefined,
): FamiliarAccountRegistryState => ({
  accounts:
    state?.accounts && typeof state.accounts === "object"
      ? Object.fromEntries(
          Object.entries(state.accounts).map(([k, v]) => [
            k,
            normalizeAccountRecord(v as Record<string, unknown>),
          ]),
        )
      : {},
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
  cliSessions:
    state?.cliSessions && typeof state.cliSessions === "object"
      ? state.cliSessions
      : {},
  users:
    state?.users && typeof state.users === "object"
      ? Object.fromEntries(
          Object.entries(state.users).map(([k, v]) => [
            k,
            normalizeUserRecord(v as Record<string, unknown>),
          ]),
        )
      : {},
  emailIndex:
    state?.emailIndex && typeof state.emailIndex === "object"
      ? state.emailIndex
      : {},
  contactSubmissions:
    state?.contactSubmissions && typeof state.contactSubmissions === "object"
      ? state.contactSubmissions
      : {},
});
