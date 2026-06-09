import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAccountRegistryState } from "./account-registry-state.ts";

test("normalizeAccountRegistryState backfills toolUrls on legacy integrations", () => {
  const normalized = normalizeAccountRegistryState({
    integrations: {
      setup_legacy: {
        id: "setup_legacy",
        accountId: "acct_123",
        name: "Legacy",
        baseUrl: null,
        aiApiKey: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  } as unknown as Partial<import("./account.types").FamiliarAccountRegistryState>);

  assert.deepEqual(normalized.integrations.setup_legacy.toolUrls, {});
});

test("normalizeAccountRegistryState backfills integrations for legacy state", () => {
  const normalized = normalizeAccountRegistryState({
    accounts: {
      acct_123: {
        id: "acct_123",
        defaultSetupId: "setup_123",
        // Billing fields removed for open-source
        createdAt: "2026-03-25T10:00:00.000Z",
      },
    },
    tokens: {
      tok_123: {
        id: "tok_123",
        accountId: "acct_123",
        prefix: "fam_secr",
        lastFour: "cret",
        tokenHash: "hash_123",
        createdAt: "2026-03-25T10:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
      },
    },
    tokenIndex: {
      hash_123: "tok_123",
    },
  });

  assert.deepEqual(normalized, {
    accounts: {
      acct_123: {
        id: "acct_123",
        defaultSetupId: "setup_123",
        // Billing fields removed for open-source
        createdAt: "2026-03-25T10:00:00.000Z",
      },
    },
    integrations: {},
    tokens: {
      tok_123: {
        id: "tok_123",
        accountId: "acct_123",
        prefix: "fam_secr",
        lastFour: "cret",
        tokenHash: "hash_123",
        createdAt: "2026-03-25T10:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
      },
    },
    tokenIndex: {
      hash_123: "tok_123",
    },
    browserLoginSessions: {},
    users: {},
    emailIndex: {},
    contactSubmissions: {},
    rateLimits: {},
  });
});
