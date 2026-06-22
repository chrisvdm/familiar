import {
  deleteChatSession,
  loadChatSession,
  saveChatSession,
} from "../chat/chat.storage.ts";
import {
  buildGlobalMemoryMarkdown,
  createInitialChatState,
  createThreadSummary,
  getThreadTitleFromMessages,
  pruneGlobalMemoryByThreadId,
  type ChatMessage,
  type ChatSessionState,
  type ChatThreadSummary,
} from "../chat/shared.ts";
import { tokenize } from "./provider.decision.ts";
import {
  MAX_THREADS_PER_USER,
  SOFT_THREADS_LIMIT,
} from "./provider.logic.ts";
import { logProviderAudit } from "./provider.audit.ts";
import type { ProviderChannelInput, ProviderUserContext } from "./provider.types.ts";
import {
  loadOrCreateProviderUserContext,
  saveProviderUserContext,
} from "./provider.storage.ts";

const buildChannelKey = (channel: ProviderChannelInput) =>
  `${channel.type.trim().toLowerCase()}:${channel.id.trim()}`;



const sortThreadsByRecency = (threads: ChatThreadSummary[]) =>
  [...threads].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

export const updateThreadSummaries = (
  threads: ChatThreadSummary[],
  nextSummary: ChatThreadSummary,
) =>
  sortThreadsByRecency(
    threads.map((thread) => (thread.id === nextSummary.id ? nextSummary : thread)),
  );

export const buildThreadSummary = (
  currentSummary: ChatThreadSummary,
  messages: ChatMessage[],
) => ({
  ...currentSummary,
  title: currentSummary.isTitleEdited
    ? currentSummary.title
    : getThreadTitleFromMessages(messages),
  updatedAt: messages.at(-1)?.createdAt || currentSummary.updatedAt,
  messageCount: messages.length,
});

const scoreThreadFit = ({
  content,
  thread,
  session,
}: {
  content: string;
  thread: ChatThreadSummary;
  session: ChatSessionState;
}) => {
  const contentTokens = new Set(tokenize(content));

  if (contentTokens.size === 0) {
    return 0;
  }

  const threadCorpus = [
    thread.title,
    session.memory.summary,
    ...session.messages.slice(-4).map((message) => message.content),
  ].join(" ");
  const threadTokens = new Set(tokenize(threadCorpus));
  let matches = 0;

  for (const token of contentTokens) {
    if (threadTokens.has(token)) {
      matches += 1;
    }
  }

  return matches / Math.max(contentTokens.size, 1);
};


const shouldReuseChannelThread = ({
  content,
  context,
  threadId,
  session,
}: {
  content: string;
  context: ProviderUserContext;
  threadId: string;
  session: ChatSessionState;
}) => {
  const thread = context.threads.find((entry) => entry.id === threadId);

  if (!thread) {
    return false;
  }

  if (session.messages.length === 0) {
    return true;
  }

  if (session.pendingToolConfirmation) {
    return true;
  }

  return scoreThreadFit({ content, thread, session }) >= 0.2;
};

export const resolveThreadId = async ({
  context,
  providedThreadId,
  channel,
  content,
}: {
  context: ProviderUserContext;
  providedThreadId?: string;
  channel: ProviderChannelInput;
  content: string;
}): Promise<{ threadId: string | null; session?: ChatSessionState }> => {
  const normalizedThreadId = providedThreadId?.trim();

  if (normalizedThreadId) {
    const threadExists = context.threads.some(
      (thread) => thread.id === normalizedThreadId,
    );

    if (!threadExists) {
      throw new Error("Thread not found for this provider user.");
    }

    return { threadId: normalizedThreadId };
  }

  const channelState = context.channels[buildChannelKey(channel)];

  if (channelState?.lastActiveThreadId) {
    const session = await loadChatSession(channelState.lastActiveThreadId);
    const canReuse = shouldReuseChannelThread({
      content,
      context,
      threadId: channelState.lastActiveThreadId,
      session,
    });

    if (canReuse) {
      return { threadId: channelState.lastActiveThreadId, session };
    }
  }

  return { threadId: null };
};

const autoArchiveOldestThreads = (
  threads: ChatThreadSummary[],
  targetCount: number,
): ChatThreadSummary[] => {
  const activeThreads = threads.filter((t) => !t.archivedAt);
  if (activeThreads.length <= targetCount) return threads;

  const toArchiveCount = activeThreads.length - targetCount;
  const sortedByAge = [...activeThreads].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const archiveIds = new Set(sortedByAge.slice(0, toArchiveCount).map((t) => t.id));
  const now = new Date().toISOString();

  return threads.map((t) =>
    archiveIds.has(t.id) ? { ...t, archivedAt: now } : t,
  );
};

export const createThreadForContext = async ({
  context,
  isPrivate = false,
  channel,
}: {
  context: ProviderUserContext;
  isPrivate?: boolean;
  channel: ProviderChannelInput;
}) => {
  if (context.threads.length >= MAX_THREADS_PER_USER) {
    throw new Error(
      `Thread limit reached (${MAX_THREADS_PER_USER}). Delete old threads to create new ones.`,
    );
  }

  const threadId = crypto.randomUUID();
  const nextState = createInitialChatState();

  await saveChatSession(threadId, nextState);

  const nextThread = createThreadSummary(threadId, nextState.messages.length, {
    isTemporary: isPrivate,
  });

  // Auto-archive oldest threads when approaching hard limit
  let nextThreads = sortThreadsByRecency([nextThread, ...context.threads]);
  nextThreads = autoArchiveOldestThreads(nextThreads, SOFT_THREADS_LIMIT);

  const channelKey = buildChannelKey(channel);
  const nextContext: ProviderUserContext = {
    ...context,
    threads: nextThreads,
    channels: {
      ...context.channels,
      [channelKey]: {
        type: channel.type,
        id: channel.id,
        lastActiveThreadId: threadId,
        updatedAt: new Date().toISOString(),
      },
    },
    threadChannels: updateThreadChannelState({
      context,
      channel,
      threadId,
    }),
  };

  await saveProviderUserContext(nextContext);

  return { context: nextContext, threadId, session: nextState };
};

export const updateChannelState = ({
  context,
  channel,
  threadId,
}: {
  context: ProviderUserContext;
  channel: ProviderChannelInput;
  threadId: string;
}) => ({
  ...context.channels,
  [buildChannelKey(channel)]: {
    type: channel.type,
    id: channel.id,
    lastActiveThreadId: threadId,
    updatedAt: new Date().toISOString(),
  },
});

export const updateThreadChannelState = ({
  context,
  channel,
  threadId,
}: {
  context: ProviderUserContext;
  channel: ProviderChannelInput;
  threadId: string;
}) => ({
  ...context.threadChannels,
  [threadId]: {
    type: channel.type,
    id: channel.id,
  },
});

export const listProviderThreads = async ({
  providerId,
  userId,
  limit = 50,
  cursor,
  includeArchived = false,
}: {
  providerId: string;
  userId: string;
  limit?: number;
  cursor?: string;
  includeArchived?: boolean;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  let threads = sortThreadsByRecency(context.threads);

  if (!includeArchived) {
    threads = threads.filter((t) => !t.archivedAt);
  }

  const effectiveLimit = Math.min(Math.max(limit, 1), 100);
  let startIndex = 0;

  if (cursor) {
    const cursorIndex = threads.findIndex((t) => t.id === cursor);
    if (cursorIndex !== -1) {
      startIndex = cursorIndex + 1;
    }
  }

  const paginatedThreads = threads.slice(startIndex, startIndex + effectiveLimit);
  const nextCursor =
    startIndex + effectiveLimit < threads.length
      ? paginatedThreads.at(-1)?.id
      : undefined;

  return {
    threads: paginatedThreads.map((thread) => ({
      thread_id: thread.id,
      title: thread.title,
      is_private: thread.isTemporary,
      updated_at: thread.updatedAt,
      archived_at: thread.archivedAt ?? null,
    })),
    next_cursor: nextCursor ?? null,
  };
};

export const createProviderThread = async ({
  providerId,
  userId,
  title,
  isPrivate,
  channel,
  requestId,
}: {
  providerId: string;
  userId: string;
  title?: string;
  isPrivate?: boolean;
  channel: ProviderChannelInput;
  requestId?: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  const created = await createThreadForContext({
    context,
    isPrivate,
    channel,
  });

  if (title?.trim()) {
    const nextThreads = created.context.threads.map((thread) =>
      thread.id === created.threadId
        ? {
            ...thread,
            title: title.trim().slice(0, 80),
            isTitleEdited: true,
          }
        : thread,
    );
    const nextContext = {
      ...created.context,
      threads: nextThreads,
    };

    await saveProviderUserContext(nextContext);
  }

  logProviderAudit({
    event: "provider.thread.created",
    requestId,
    providerId,
    userId,
    threadId: created.threadId,
    channelType: channel.type,
    channelId: channel.id,
    status: "ok",
    metadata: {
      isPrivate: Boolean(isPrivate),
    },
  });

  return {
    thread_id: created.threadId,
    title: title?.trim() || getThreadTitleFromMessages(created.session.messages),
    is_private: Boolean(isPrivate),
    status: "ok",
  };
};

export const renameProviderThread = async ({
  providerId,
  userId,
  threadId,
  title,
  requestId,
}: {
  providerId: string;
  userId: string;
  threadId: string;
  title: string;
  requestId?: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  const nextTitle = title.trim().slice(0, 80);

  if (!nextTitle) {
    throw new Error("Thread title is required.");
  }

  const thread = context.threads.find((entry) => entry.id === threadId);

  if (!thread) {
    throw new Error("Thread not found.");
  }

  const nextContext: ProviderUserContext = {
    ...context,
    threads: context.threads.map((entry) =>
      entry.id === threadId
        ? {
            ...entry,
            title: nextTitle,
            isTitleEdited: true,
            updatedAt: new Date().toISOString(),
          }
        : entry,
    ),
    globalMemory: {
      ...context.globalMemory,
      threadSummaries: context.globalMemory.threadSummaries.map((summary) =>
        summary.threadId === threadId ? { ...summary, title: nextTitle } : summary,
      ),
      markdown: "",
    },
  };

  nextContext.globalMemory.markdown = buildGlobalMemoryMarkdown({
    memory: nextContext.globalMemory,
    threadSummaries: nextContext.globalMemory.threadSummaries,
  });

  await saveProviderUserContext(nextContext);

  logProviderAudit({
    event: "provider.thread.renamed",
    requestId,
    providerId,
    userId,
    threadId,
    status: "ok",
  });

  return {
    thread_id: threadId,
    title: nextTitle,
    status: "ok",
  };
};

export const deleteProviderThread = async ({
  providerId,
  userId,
  threadId,
  requestId,
}: {
  providerId: string;
  userId: string;
  threadId: string;
  requestId?: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  const thread = context.threads.find((entry) => entry.id === threadId);

  if (!thread) {
    throw new Error("Thread not found.");
  }

  await deleteChatSession(threadId);

  const nextContext: ProviderUserContext = {
    ...context,
    threads: context.threads.filter((entry) => entry.id !== threadId),
    globalMemory: pruneGlobalMemoryByThreadId(context.globalMemory, threadId),
    threadChannels: Object.fromEntries(
      Object.entries(context.threadChannels ?? {}).filter(
        ([entryThreadId]) => entryThreadId !== threadId,
      ),
    ),
    channels: Object.fromEntries(
      Object.entries(context.channels).map(([key, channel]) => [
        key,
        channel.lastActiveThreadId === threadId
          ? { ...channel, lastActiveThreadId: null }
          : channel,
      ]),
    ),
  };

  await saveProviderUserContext(nextContext);

  logProviderAudit({
    event: "provider.thread.deleted",
    requestId,
    providerId,
    userId,
    threadId,
    status: "ok",
  });

  return {
    thread_id: threadId,
    status: "ok",
  };
};

export const getProviderHydratedState = async ({
  providerId,
  userId,
  channel,
}: {
  providerId: string;
  userId: string;
  channel: ProviderChannelInput;
}) => {
  let context = await loadOrCreateProviderUserContext({ providerId, userId });
  const channelKey = buildChannelKey(channel);
  const channelState = context.channels[channelKey];

  let activeThreadId =
    channelState?.lastActiveThreadId || context.threads[0]?.id || null;

  if (!activeThreadId) {
    const created = await createThreadForContext({
      context,
      isPrivate: false,
      channel,
    });
    context = created.context;
    activeThreadId = created.threadId;
  }

  if (
    !context.channels[channelKey] ||
    context.channels[channelKey]?.lastActiveThreadId !== activeThreadId
  ) {
    context = await saveProviderUserContext({
      ...context,
      channels: {
        ...context.channels,
        [channelKey]: {
          type: channel.type,
          id: channel.id,
          lastActiveThreadId: activeThreadId,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }

  const threadSession = await loadChatSession(activeThreadId);

  return {
    activeThreadId,
    threads: context.threads,
    globalMemory: context.globalMemory,
    selectedModel: context.selectedModel,
    session: threadSession,
  };
};


export const getProviderThreadMemory = async ({
  providerId,
  userId,
  threadId,
}: {
  providerId: string;
  userId: string;
  threadId: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  const thread = context.threads.some((entry) => entry.id === threadId);

  if (!thread) {
    throw new Error("Thread not found.");
  }

  const session = await loadChatSession(threadId);
  return session.memory;
};
