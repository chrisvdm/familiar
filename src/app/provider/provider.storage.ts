import { env } from "cloudflare:workers";

import { DEFAULT_MODEL } from "../chat/conversation.runtime";
import { createEmptyGlobalMemory } from "../chat/shared";
import type { ProviderUserContext } from "./provider.types";

type ProviderUserContextStub = {
  getContext: () => Promise<{ value: ProviderUserContext } | { error: string }>;
  saveContext: (data: ProviderUserContext) => Promise<ProviderUserContext>;
  deleteContext: () => Promise<void>;
};

const providerEnv = env as typeof env & {
  PROVIDER_USER_CONTEXTS: DurableObjectNamespace;
};

const getProviderUserStub = ({
  providerId,
  userId,
}: {
  providerId: string;
  userId: string;
}) => {
  const id = providerEnv.PROVIDER_USER_CONTEXTS.idFromName(
    `${providerId}:${userId}`,
  );
  return providerEnv.PROVIDER_USER_CONTEXTS.get(id) as unknown as ProviderUserContextStub;
};

export const createProviderUserContext = ({
  providerId,
  userId,
}: {
  providerId: string;
  userId: string;
}): ProviderUserContext => {
  const now = new Date().toISOString();

  return {
    providerId,
    userId,
    selectedModel: DEFAULT_MODEL,
    memoryPolicy: {
      mode: "provider_user",
    },
    globalMemory: createEmptyGlobalMemory(),
    threads: [],
    allowedTools: [],
    channels: {},
    threadChannels: {},
    requestLog: {
      conversationInputTimestamps: [],
      toolSyncTimestamps: [],
    },
    idempotency: {},
    auditLog: [],
    pendingExecutions: {},
    lastSynthesis: null,
    nextSynthesis: null,
    createdAt: now,
    updatedAt: now,
  };
};

export const loadProviderUserContext = async ({
  providerId,
  userId,
}: {
  providerId: string;
  userId: string;
}) => {
  const result = await getProviderUserStub({ providerId, userId }).getContext();

  if ("error" in result) {
    return null;
  }

  return result.value as ProviderUserContext;
};

export const loadOrCreateProviderUserContext = async ({
  providerId,
  userId,
}: {
  providerId: string;
  userId: string;
}) => {
  const existing = await loadProviderUserContext({ providerId, userId });

  if (existing) {
    return existing;
  }

  const created = createProviderUserContext({ providerId, userId });
  await saveProviderUserContext(created);
  return created;
};

export const resetProviderUserContext = async ({
  providerId,
  userId,
}: {
  providerId: string;
  userId: string;
}) => {
  const fresh = createProviderUserContext({ providerId, userId });
  await saveProviderUserContext(fresh);
  return fresh;
};

export const saveProviderUserContext = async (context: ProviderUserContext) => {
  const normalized: ProviderUserContext = {
    ...context,
    requestLog: {
      conversationInputTimestamps:
        context.requestLog?.conversationInputTimestamps ?? [],
      toolSyncTimestamps: context.requestLog?.toolSyncTimestamps ?? [],
    },
    threadChannels: context.threadChannels ?? {},
    idempotency: context.idempotency ?? {},
    auditLog: context.auditLog ?? [],
    lastSynthesis: context.lastSynthesis ?? null,
    nextSynthesis: context.nextSynthesis ?? null,
    updatedAt: new Date().toISOString(),
  };

  await getProviderUserStub({
    providerId: normalized.providerId,
    userId: normalized.userId,
  }).saveContext(normalized);

  return normalized;
};

export const appendProviderAuditEvent = async ({
  providerId,
  userId,
  event,
}: {
  providerId: string;
  userId: string;
  event: {
    event: string;
    requestId?: string;
    status?: "ok" | "error";
    code?: string;
    detail?: string;
    metadata?: Record<string, unknown>;
  };
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  const auditLog = [...context.auditLog];
  auditLog.push({ ...event, at: new Date().toISOString() });
  if (auditLog.length > 100) {
    auditLog.shift();
  }
  await saveProviderUserContext({ ...context, auditLog });
};

export const deleteProviderUserContext = async ({
  providerId,
  userId,
}: {
  providerId: string;
  userId: string;
}) => {
  await getProviderUserStub({ providerId, userId }).deleteContext();
};


export const recordPendingExecution = async ({
  providerId,
  userId,
  executionId,
  threadId,
  toolName,
}: {
  providerId: string;
  userId: string;
  executionId: string;
  threadId: string;
  toolName: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  const pendingExecutions = { ...context.pendingExecutions };
  pendingExecutions[executionId] = {
    executionId,
    threadId,
    toolName,
    createdAt: new Date().toISOString(),
  };
  // Clean up old executions (keep last 50)
  const entries = Object.values(pendingExecutions);
  if (entries.length > 50) {
    const sorted = entries.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    for (const old of sorted.slice(0, entries.length - 50)) {
      delete pendingExecutions[old.executionId];
    }
  }
  await saveProviderUserContext({
    ...context,
    pendingExecutions,
  });
};

export const resolvePendingExecution = async ({
  providerId,
  userId,
  executionId,
}: {
  providerId: string;
  userId: string;
  executionId: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  return context.pendingExecutions[executionId] ?? null;
};

export const clearPendingExecution = async ({
  providerId,
  userId,
  executionId,
}: {
  providerId: string;
  userId: string;
  executionId: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  const pendingExecutions = { ...context.pendingExecutions };
  delete pendingExecutions[executionId];
  await saveProviderUserContext({
    ...context,
    pendingExecutions,
  });
};
