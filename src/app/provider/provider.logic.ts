import { createEmptyGlobalMemory, type GlobalMemory } from "../chat/shared.ts";

import type { MemoryPolicy, ProviderExecutionState } from "./provider.types";

export const CONVERSATION_RATE_LIMIT_WINDOW_MS = 60_000;
export const CONVERSATION_RATE_LIMIT_MAX_REQUESTS = 30;

export const selectProviderGlobalMemory = ({
  memoryPolicy,
  globalMemory,
  isPrivate,
}: {
  memoryPolicy: MemoryPolicy;
  globalMemory: GlobalMemory;
  isPrivate: boolean;
}) => {
  if (isPrivate) {
    return createEmptyGlobalMemory();
  }

  if (memoryPolicy.mode === "provider_user" || memoryPolicy.mode === "custom_scope") {
    return globalMemory;
  }

  return createEmptyGlobalMemory();
};

export const applyConversationRateLimit = ({
  timestamps,
  now = Date.now(),
  maxRequests = CONVERSATION_RATE_LIMIT_MAX_REQUESTS,
  windowMs = CONVERSATION_RATE_LIMIT_WINDOW_MS,
}: {
  timestamps: string[];
  now?: number;
  maxRequests?: number;
  windowMs?: number;
}) => {
  const cutoff = now - windowMs;
  const validTimestamps = timestamps.filter((value) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed >= cutoff;
  });

  if (validTimestamps.length >= maxRequests) {
    const oldestTimestamp = Date.parse(validTimestamps[0] ?? "");
    const retryAfterMs = Number.isFinite(oldestTimestamp)
      ? Math.max(windowMs - (now - oldestTimestamp), 1_000)
      : windowMs;

    return {
      allowed: false as const,
      timestamps: validTimestamps,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1_000),
    };
  }

  return {
    allowed: true as const,
    timestamps: [...validTimestamps, new Date(now).toISOString()],
  };
};

export const determineMockExecutionState = ({
  toolName,
  args,
}: {
  toolName: string;
  args: Record<string, unknown>;
}): ProviderExecutionState => {
  const requestedState =
    typeof args.mock_state === "string" ? args.mock_state : null;

  if (
    requestedState === "accepted" ||
    requestedState === "in_progress" ||
    requestedState === "needs_clarification" ||
    requestedState === "failed" ||
    requestedState === "completed"
  ) {
    return requestedState;
  }

  if (toolName === "spreadsheet.update_row") {
    const sheet = args.sheet;
    const rowId = args.row_id;
    const values = args.values;

    if (
      typeof sheet !== "string" ||
      !sheet.trim() ||
      typeof rowId !== "string" ||
      !rowId.trim() ||
      !values ||
      typeof values !== "object"
    ) {
      return "needs_clarification";
    }
  }

  return "completed";
};
