import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAccountRegistryState } from "./account-registry-state.ts";

test("normalizeAccountRegistryState backfills integrations for legacy state", () => {
  const normalized = normalizeAccountRegistryState({
    accounts: {
      acct_123: {
        id: "acct_123",
        defaultSetupId: "setup_123",
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
  });
});
