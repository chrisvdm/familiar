import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyGlobalMemory } from "../chat/shared.ts";

import {
  applyConversationRateLimit,
  determineMockExecutionState,
  selectProviderGlobalMemory,
} from "./provider.logic.ts";

test("private threads do not expose shared global memory", () => {
  const globalMemory = createEmptyGlobalMemory();
  globalMemory.identity.name = [
    {
      key: "name",
      value: "Chris",
      confidence: 0.99,
      updatedAt: "2026-03-19T10:00:00.000Z",
    },
  ];

  const result = selectProviderGlobalMemory({
    memoryPolicy: { mode: "provider_user" },
    globalMemory,
    isPrivate: true,
  });

  assert.deepEqual(result.identity, {});
});

test("provider-user retrieval can use shared global memory", () => {
  const globalMemory = createEmptyGlobalMemory();
  globalMemory.identity.name = [
    {
      key: "name",
      value: "Chris",
      confidence: 0.99,
      updatedAt: "2026-03-19T10:00:00.000Z",
    },
  ];

  const result = selectProviderGlobalMemory({
    memoryPolicy: { mode: "provider_user" },
    globalMemory,
    isPrivate: false,
  });

  assert.equal(result.identity.name?.[0]?.value, "Chris");
});

test("rate limiter allows requests under the rolling limit", () => {
  const now = Date.parse("2026-03-19T10:00:30.000Z");
  const timestamps = [
    "2026-03-19T10:00:00.000Z",
    "2026-03-19T10:00:10.000Z",
  ];

  const result = applyConversationRateLimit({
    timestamps,
    now,
    maxRequests: 3,
    windowMs: 60_000,
  });

  assert.equal(result.allowed, true);
  if (result.allowed) {
    assert.equal(result.timestamps.length, 3);
  }
});

test("rate limiter blocks requests over the rolling limit", () => {
  const now = Date.parse("2026-03-19T10:00:30.000Z");
  const timestamps = [
    "2026-03-19T10:00:00.000Z",
    "2026-03-19T10:00:10.000Z",
    "2026-03-19T10:00:20.000Z",
  ];

  const result = applyConversationRateLimit({
    timestamps,
    now,
    maxRequests: 3,
    windowMs: 60_000,
  });

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.retryAfterSeconds, 30);
  }
});

test("mock execution requests clarification when spreadsheet arguments are incomplete", () => {
  const result = determineMockExecutionState({
    toolName: "spreadsheet.update_row",
    args: {
      sheet: "Sales",
    },
  });

  assert.equal(result, "needs_clarification");
});

test("mock execution respects explicit requested states", () => {
  const result = determineMockExecutionState({
    toolName: "spreadsheet.update_row",
    args: {
      mock_state: "accepted",
    },
  });

  assert.equal(result, "accepted");
});

test("mock execution completes when spreadsheet arguments are present", () => {
  const result = determineMockExecutionState({
    toolName: "spreadsheet.update_row",
    args: {
      sheet: "Sales",
      row_id: "42",
      values: {
        status: "contacted",
      },
    },
  });

  assert.equal(result, "completed");
});
