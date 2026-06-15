import { DurableObject } from "cloudflare:workers";

import type {
  FamiliarAccount,
  FamiliarAccountRegistryState,
  FamiliarApiToken,
  FamiliarBrowserLoginSession,
  FamiliarIntegrationConfig,
  FamiliarTokenAuth,
} from "./account.types";
import {
  createInitialRegistryState,
  normalizeAccountRegistryState,
} from "./account-registry-state";

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

const randomHex = (length: number) =>
  toHex(crypto.getRandomValues(new Uint8Array(Math.ceil(length / 2)))).slice(
    0,
    length,
  );

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
    name?: string;
    toolUrls?: Record<string, string>;
    transport?: "webhook" | "websocket";
  }) {
    const state = await this.loadState();
    const account = state.accounts[input.accountId];

    if (!account) {
      return { error: "Account not found." };
    }

    const existing = state.integrations[input.integrationId];
    const now = new Date().toISOString();
    const integration: FamiliarIntegrationConfig = existing
      ? {
          ...existing,
          baseUrl: input.baseUrl,
          aiApiKey: input.aiApiKey,
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.toolUrls !== undefined ? { toolUrls: input.toolUrls } : {}),
          ...(input.transport !== undefined ? { transport: input.transport } : {}),
          updatedAt: now,
        }
      : {
          id: input.integrationId,
          accountId: input.accountId,
          name: input.name || "Integration",
          baseUrl: input.baseUrl,
          aiApiKey: input.aiApiKey,
          toolUrls: input.toolUrls ?? {},
          webhookSecret: `whsec_${randomHex(32)}`,
          transport: input.transport ?? "webhook",
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

  async listTokens(input: { accountId: string }) {
    const state = await this.loadState();
    const account = state.accounts[input.accountId];

    if (!account) {
      return { error: "Account not found." };
    }

    const tokens = Object.values(state.tokens)
      .filter((token) => token.accountId === input.accountId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return { value: tokens };
  }

  async revokeToken(input: { accountId: string; tokenId: string }) {
    const state = await this.loadState();
    const account = state.accounts[input.accountId];

    if (!account) {
      return { error: "Account not found." };
    }

    const token = state.tokens[input.tokenId];

    if (!token || token.accountId !== input.accountId) {
      return { error: "Token not found." };
    }

    if (token.revokedAt) {
      return { error: "Token already revoked." };
    }

    const revokedToken = {
      ...token,
      revokedAt: new Date().toISOString(),
    };

    state.tokens[input.tokenId] = revokedToken;
    await this.saveState(state);

    return { value: revokedToken };
  }

  async createBrowserLoginSession(input: {
    tokenValue: string;
    accountId: string;
  }) {
    const state = await this.loadState();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    // prune expired sessions lazily
    for (const [code, session] of Object.entries(state.browserLoginSessions)) {
      if (new Date(session.expiresAt) < now || session.usedAt) {
        delete state.browserLoginSessions[code];
      }
    }

    const code = randomHex(32);
    const session: FamiliarBrowserLoginSession = {
      code,
      tokenValue: input.tokenValue,
      accountId: input.accountId,
      createdAt: now.toISOString(),
      expiresAt,
    };
    state.browserLoginSessions[code] = session;
    await this.saveState(state);
    return { value: { code, expiresAt } };
  }

  async consumeBrowserLoginSession(input: { code: string }) {
    const state = await this.loadState();
    const session = state.browserLoginSessions[input.code];

    if (!session) {
      return { error: "Session not found." };
    }

    if (session.usedAt) {
      return { error: "Session already used." };
    }

    if (new Date(session.expiresAt) < new Date()) {
      return { error: "Session expired." };
    }

    session.usedAt = new Date().toISOString();
    state.browserLoginSessions[input.code] = session;
    await this.saveState(state);

    return {
      value: {
        tokenValue: session.tokenValue,
        accountId: session.accountId,
      },
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
      name: "Default Integration",
      baseUrl: null,
      aiApiKey: null,
      toolUrls: {},
      webhookSecret: `whsec_${randomHex(32)}`,
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

    await this.saveState(state);

    return {
      value: {
        actionCount: account.actionCount,
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
        freeActionsRemaining: Math.max(0, 5 - (account.actionCount || 0)),
      },
    };
  }

  async listAccountIntegrations(input: { accountId: string }) {
    const state = await this.loadState();
    const account = state.accounts[input.accountId];

    if (!account) {
      return { error: "Account not found." };
    }

    const integrations = Object.values(state.integrations)
      .filter((i) => i.accountId === input.accountId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return { value: integrations };
  }

  async createUser(input: { user: import("./account.types").FamiliarUser }) {
    const state = await this.loadState();
    state.users[input.user.id] = input.user;
    state.emailIndex[input.user.email.toLowerCase()] = input.user.id;
    await this.saveState(state);
    return { value: input.user };
  }

  async getUserByEmail(input: { email: string }) {
    const state = await this.loadState();
    const userId = state.emailIndex[input.email.toLowerCase()];

    if (!userId) {
      return { error: "User not found." };
    }

    const user = state.users[userId];
    if (!user) {
      return { error: "User not found." };
    }

    return { value: user };
  }

  async storeContactSubmission(input: {
    submission: import("./account.types").FamiliarContactSubmission;
  }) {
    const state = await this.loadState();
    state.contactSubmissions[input.submission.id] = input.submission;
    await this.saveState(state);
    return { value: input.submission };
  }

  async checkRateLimit(input: {
    key: string;
    maxRequests: number;
    windowMs: number;
  }) {
    const state = await this.loadState();
    const now = Date.now();
    const cutoff = now - input.windowMs;

    const timestamps = (state.rateLimits[input.key] ?? []).filter((ts) => {
      const parsed = Date.parse(ts);
      return Number.isFinite(parsed) && parsed >= cutoff;
    });

    if (timestamps.length >= input.maxRequests) {
      const oldestTimestamp = Date.parse(timestamps[0] ?? "");
      const retryAfterMs = Number.isFinite(oldestTimestamp)
        ? Math.max(input.windowMs - (now - oldestTimestamp), 1_000)
        : input.windowMs;

      return {
        allowed: false as const,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1_000),
      };
    }

    state.rateLimits[input.key] = [...timestamps, new Date(now).toISOString()];
    await this.saveState(state);

    return { allowed: true as const };
  }
}
