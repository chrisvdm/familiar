import { DurableObject } from "cloudflare:workers";

import type {
  FamiliarAccount,
  FamiliarAccountRegistryState,
  FamiliarApiToken,
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
}
