import { DurableObject } from "cloudflare:workers";

import type {
  FamiliarAccount,
  FamiliarAccountRegistryState,
  FamiliarApiToken,
  FamiliarCliSession,
  FamiliarIntegrationConfig,
  FamiliarTokenAuth,
} from "./account.types";
import {
  createInitialRegistryState,
  normalizeAccountRegistryState,
} from "./account-registry-state";

const ACCOUNT_REGISTRY_KEY = "account-registry";

export class AccountRegistryDurableObject extends DurableObject {
  private async loadState() {
    const existing =
      await this.ctx.storage.get<FamiliarAccountRegistryState>(ACCOUNT_REGISTRY_KEY);

    return existing
      ? normalizeAccountRegistryState(existing)
      : createInitialRegistryState();
  }

  private async saveState(state: FamiliarAccountRegistryState) {
    await this.ctx.storage.put(ACCOUNT_REGISTRY_KEY, state);
    return state;
  }

  async createAccount(input: {
    account: FamiliarAccount;
    integration: FamiliarIntegrationConfig;
    token: FamiliarApiToken;
  }) {
    const state = await this.loadState();

    state.accounts[input.account.id] = input.account;
    state.integrations[input.integration.id] = input.integration;
    state.tokens[input.token.id] = input.token;
    state.tokenIndex[input.token.tokenHash] = input.token.id;

    await this.saveState(state);

    return {
      account: input.account,
      integration: input.integration,
      token: input.token,
    };
  }

  async updateIntegration(input: {
    integrationId: string;
    accountId: string;
    baseUrl: string | null;
    aiApiKey: string | null;
  }) {
    const state = await this.loadState();
    const account = state.accounts[input.accountId];

    if (!account) {
      return { error: "Account not found." };
    }

    if (account.defaultSetupId !== input.integrationId) {
      return { error: "Integration not found." };
    }

    const existing = state.integrations[input.integrationId];
    const now = new Date().toISOString();
    const integration: FamiliarIntegrationConfig = existing
      ? {
          ...existing,
          baseUrl: input.baseUrl,
          aiApiKey: input.aiApiKey,
          updatedAt: now,
        }
      : {
          id: input.integrationId,
          accountId: input.accountId,
          baseUrl: input.baseUrl,
          aiApiKey: input.aiApiKey,
          createdAt: now,
          updatedAt: now,
        };

    state.integrations[input.integrationId] = integration;
    await this.saveState(state);

    return { value: integration };
  }

  async issueToken(input: { accountId: string; token: FamiliarApiToken }) {
    const state = await this.loadState();
    const account = state.accounts[input.accountId];

    if (!account) {
      return { error: "Account not found." };
    }

    state.tokens[input.token.id] = input.token;
    state.tokenIndex[input.token.tokenHash] = input.token.id;

    await this.saveState(state);

    return {
      account,
      token: input.token,
    };
  }

  async createCliSession(input: { sessionId: string }) {
    const state = await this.loadState();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    // prune expired sessions lazily
    for (const [id, session] of Object.entries(state.cliSessions)) {
      if (new Date(session.expiresAt) < now) {
        delete state.cliSessions[id];
      }
    }

    const session: FamiliarCliSession = { sessionId: input.sessionId, expiresAt };
    state.cliSessions[input.sessionId] = session;
    await this.saveState(state);
    return { value: session };
  }

  async completeCliSession(input: { sessionId: string; tokenValue: string }) {
    const state = await this.loadState();
    const session = state.cliSessions[input.sessionId];

    if (!session) {
      return { error: "Session not found." };
    }

    if (new Date(session.expiresAt) < new Date()) {
      return { error: "Session expired." };
    }

    // token validity is verified by the service layer before calling here
    state.cliSessions[input.sessionId] = { ...session, tokenValue: input.tokenValue };
    await this.saveState(state);
    return { value: "ok" as const };
  }

  async pollCliSession(input: { sessionId: string }) {
    const state = await this.loadState();
    const session = state.cliSessions[input.sessionId];

    if (!session) {
      return { state: "expired" as const };
    }

    if (new Date(session.expiresAt) < new Date()) {
      return { state: "expired" as const };
    }

    if (session.tokenValue) {
      return { state: "completed" as const, tokenValue: session.tokenValue };
    }

    return { state: "pending" as const };
  }

  async authenticateToken(input: { tokenHash: string }) {
    const state = await this.loadState();
    const tokenId = state.tokenIndex[input.tokenHash];

    if (!tokenId) {
      return { error: "Token not found." };
    }

    const token = state.tokens[tokenId];

    if (!token || token.revokedAt) {
      return { error: "Token not found." };
    }

    const account = state.accounts[token.accountId];

    if (!account) {
      return { error: "Account not found." };
    }

    const existingIntegration = state.integrations[account.defaultSetupId];
    const integration: FamiliarIntegrationConfig = existingIntegration ?? {
      id: account.defaultSetupId,
      accountId: account.id,
      baseUrl: null,
      aiApiKey: null,
      createdAt: account.createdAt,
      updatedAt: account.createdAt,
    };

    if (!existingIntegration) {
      state.integrations[integration.id] = integration;
    }

    const nextToken = {
      ...token,
      lastUsedAt: new Date().toISOString(),
    };

    state.tokens[token.id] = nextToken;
    await this.saveState(state);

    const auth: FamiliarTokenAuth = {
      account,
      integration,
      token: nextToken,
    };

    return { value: auth };
  }

  async incrementActionCount(input: { accountId: string }) {
    const state = await this.loadState();
    const account = state.accounts[input.accountId];

    if (!account) {
      return { error: "Account not found." };
    }

    account.actionCount = (account.actionCount || 0) + 1;
    if (account.plan === "free") {
      account.freeActionsUsed = (account.freeActionsUsed || 0) + 1;
    }

    await this.saveState(state);

    return {
      value: {
        actionCount: account.actionCount,
        freeActionsUsed: account.freeActionsUsed,
        freeActionsRemaining: account.plan === "free" ? Math.max(0, 10 - (account.freeActionsUsed || 0)) : null,
        plan: account.plan,
      },
    };
  }

  async getAccountUsage(input: { accountId: string }) {
    const state = await this.loadState();
    const account = state.accounts[input.accountId];

    if (!account) {
      return { error: "Account not found." };
    }

    return {
      value: {
        actionCount: account.actionCount || 0,
        freeActionsUsed: account.freeActionsUsed || 0,
        freeActionsRemaining: account.plan === "free" ? Math.max(0, 10 - (account.freeActionsUsed || 0)) : null,
        plan: account.plan,
      },
    };
  }
}
