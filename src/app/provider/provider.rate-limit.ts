import {
  applyConversationRateLimit,
  CONVERSATION_RATE_LIMIT_MAX_REQUESTS,
  CONVERSATION_RATE_LIMIT_WINDOW_MS,
  TOOLS_SYNC_RATE_LIMIT_MAX_REQUESTS,
  TOOLS_SYNC_RATE_LIMIT_WINDOW_MS,
} from "./provider.logic.ts";
import type { ProviderUserContext } from "./provider.types.ts";

export class ProviderRateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Rate limit exceeded.");
    this.name = "ProviderRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const enforceConversationRateLimit = ({
  context,
}: {
  context: ProviderUserContext;
}) => {
  const result = applyConversationRateLimit({
    timestamps: context.requestLog?.conversationInputTimestamps ?? [],
    maxRequests: CONVERSATION_RATE_LIMIT_MAX_REQUESTS,
    windowMs: CONVERSATION_RATE_LIMIT_WINDOW_MS,
  });

  if (!result.allowed) {
    throw new ProviderRateLimitError(result.retryAfterSeconds);
  }

  return {
    ...context,
    requestLog: {
      ...context.requestLog,
      conversationInputTimestamps: result.timestamps,
    },
  };
};

export const enforceToolsSyncRateLimit = ({
  context,
}: {
  context: ProviderUserContext;
}) => {
  const result = applyConversationRateLimit({
    timestamps: context.requestLog?.toolSyncTimestamps ?? [],
    maxRequests: TOOLS_SYNC_RATE_LIMIT_MAX_REQUESTS,
    windowMs: TOOLS_SYNC_RATE_LIMIT_WINDOW_MS,
  });

  if (!result.allowed) {
    throw new ProviderRateLimitError(result.retryAfterSeconds);
  }

  return {
    ...context,
    requestLog: {
      ...context.requestLog,
      toolSyncTimestamps: result.timestamps,
    },
  };
};

export const isProviderRateLimitError = (
  error: unknown,
): error is ProviderRateLimitError => error instanceof ProviderRateLimitError;
