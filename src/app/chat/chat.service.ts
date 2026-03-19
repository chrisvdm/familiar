"use server";

import { env } from "cloudflare:workers";
import { requestInfo, serverQuery } from "rwsdk/worker";

import { buildMemoryContext, refreshMemories } from "./chat.memory";
import {
  executeConversationInput,
  parseConversationInput,
  type ConversationCommandExecution,
  type ConversationThreadState,
} from "./conversation.engine";
import {
  DEFAULT_MODEL,
  buildPromptContext,
  createDateTimeSystemPrompt,
  resolveConversationTimeZone,
} from "./conversation.runtime";
import { loadChatSession, saveChatSession } from "./chat.storage";
import {
  createAssistantMessage,
  createInitialChatState,
  createThreadSummary,
  createUserMessage,
  getThreadTitleFromMessages,
  type ChatMessage,
  type ChatSessionState,
  type ChatThreadSummary,
} from "./shared";
import {
  persistBrowserSession as persistSessionState,
  getBrowserSessionIdFromRequest,
  type BrowserSession,
} from "../session/session";
import {
  createProviderThread,
  deleteProviderThread,
  handleProviderConversationInput,
  renameProviderThread,
} from "../provider/provider.service";
import {
  loadOrCreateProviderUserContext,
  saveProviderUserContext,
} from "../provider/provider.storage";
import type { ProviderChannelInput } from "../provider/provider.types";

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

const requireBrowserSession = () => {
  const session = requestInfo.ctx.session as BrowserSession | undefined;

  if (!session?.activeThreadId) {
    throw new Error("No active chat session found. Refresh the page and try again.");
  }

  return session;
};

const persistBrowserSession = async (session: BrowserSession) => {
  await persistSessionState({
    request: requestInfo.request,
    responseHeaders: requestInfo.response.headers,
    session,
  });
  requestInfo.ctx.session = session;
};

const WEB_PROVIDER_ID = "texty_web";

const getWebChannelType = () => {
  const referer = requestInfo.request.headers.get("Referer") || "";

  return referer.includes("/sandbox/messenger") ? "sandbox_messenger" : "web";
};

const getWebIdentity = () => {
  const browserSession = requireBrowserSession();
  const userId =
    getBrowserSessionIdFromRequest(requestInfo.request) ||
    browserSession.activeThreadId;
  const channel: ProviderChannelInput = {
    type: getWebChannelType(),
    id: userId,
  };

  return {
    providerId: WEB_PROVIDER_ID,
    userId,
    channel,
  };
};

const ensureWebProviderContext = async () => {
  const browserSession = requireBrowserSession();
  const { providerId, userId, channel } = getWebIdentity();
  let context = await loadOrCreateProviderUserContext({ providerId, userId });

  if (context.threads.length === 0 && browserSession.threads.length > 0) {
    context = await saveProviderUserContext({
      ...context,
      selectedModel: browserSession.selectedModel,
      globalMemory: browserSession.globalMemory,
      threads: browserSession.threads,
      channels: {
        ...context.channels,
        [`${channel.type}:${channel.id}`]: {
          type: channel.type,
          id: channel.id,
          lastActiveThreadId: browserSession.activeThreadId,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }

  return {
    browserSession,
    context,
    providerId,
    userId,
    channel,
  };
};

const syncBrowserSessionFromProviderContext = async ({
  activeThreadId,
}: {
  activeThreadId: string;
}) => {
  const { providerId, userId } = getWebIdentity();
  const providerContext = await loadOrCreateProviderUserContext({ providerId, userId });
  const threadSession = await loadChatSession(activeThreadId);
  const nextSession: BrowserSession = {
    activeThreadId,
    threads: providerContext.threads,
    globalMemory: providerContext.globalMemory,
    selectedModel: providerContext.selectedModel,
  };

  await persistBrowserSession(nextSession);

  return formatThreadState(nextSession, threadSession, nextSession.selectedModel);
};

const formatThreadState = (
  session: BrowserSession,
  threadSession: ChatSessionState,
  model?: string,
) => ({
  activeThreadId: session.activeThreadId,
  threads: session.threads,
  globalMemory: session.globalMemory,
  session: threadSession,
  model: model || session.selectedModel || DEFAULT_MODEL,
});

const getRequestTimeZone = () =>
  resolveConversationTimeZone(
    (requestInfo.request as Request & { cf?: { timezone?: string } }).cf?.timezone,
  );

const createAndPersistThread = async ({
  isTemporary = false,
}: {
  isTemporary?: boolean;
} = {}) => {
  const { providerId, userId, channel } = await ensureWebProviderContext();
  const created = await createProviderThread({
    providerId,
    userId,
    isPrivate: isTemporary,
    channel,
  });

  return syncBrowserSessionFromProviderContext({
    activeThreadId: created.thread_id,
  });
};

const sendMessageToThread = async ({
  content: rawMessage,
  threadId,
  model,
}: {
  content: string;
  threadId: string;
  model?: string;
}) => {
  const content = rawMessage.trim();
  const sessionId = threadId.trim();

  if (!sessionId) {
    throw new Error("Choose a thread before sending a message.");
  }

  if (!content) {
    throw new Error("Please enter a message before sending.");
  }

  const { providerId, userId, channel } = await ensureWebProviderContext();
  const selectedModel =
    model?.trim() ||
    requireBrowserSession().selectedModel ||
    env.OPENROUTER_MODEL ||
    DEFAULT_MODEL;

  const result = await handleProviderConversationInput({
    providerConfig: {
      token: "",
    },
    input: {
      provider_id: providerId,
      user_id: userId,
      thread_id: sessionId,
      input: {
        kind: "text",
        text: content,
      },
      model: selectedModel,
      timezone: getRequestTimeZone(),
      channel,
      context: {
        external_memories: [],
      },
    },
  });

  return syncBrowserSessionFromProviderContext({
    activeThreadId: result.thread_id,
  });
};

const selectThreadState = async (threadId: string) => {
  const nextThreadId = threadId.trim();

  if (!nextThreadId) {
    throw new Error("Choose a thread before trying to open it.");
  }

  const { browserSession, providerId, userId, channel, context } =
    await ensureWebProviderContext();
  const exists = context.threads.some((thread) => thread.id === nextThreadId);

  if (!exists) {
    throw new Error("That thread is no longer available.");
  }

  await saveProviderUserContext({
    ...context,
    channels: {
      ...context.channels,
      [`${channel.type}:${channel.id}`]: {
        type: channel.type,
        id: channel.id,
        lastActiveThreadId: nextThreadId,
        updatedAt: new Date().toISOString(),
      },
    },
  });

  return syncBrowserSessionFromProviderContext({
    activeThreadId: nextThreadId,
  });
};

const deleteThreadState = async (threadId: string) => {
  const targetThreadId = threadId.trim();

  if (!targetThreadId) {
    throw new Error("Choose a thread before trying to delete it.");
  }

  const { browserSession, providerId, userId, channel, context } =
    await ensureWebProviderContext();
  const threadExists = context.threads.some((thread) => thread.id === targetThreadId);

  if (!threadExists) {
    throw new Error("That thread is no longer available.");
  }

  await deleteProviderThread({
    providerId,
    userId,
    threadId: targetThreadId,
  });

  let nextContext = await loadOrCreateProviderUserContext({ providerId, userId });
  let nextActiveThreadId =
    browserSession.activeThreadId === targetThreadId
      ? nextContext.threads[0]?.id ?? null
      : browserSession.activeThreadId;

  if (!nextActiveThreadId) {
    const created = await createProviderThread({
      providerId,
      userId,
      channel,
      isPrivate: false,
    });
    nextActiveThreadId = created.thread_id;
    nextContext = await loadOrCreateProviderUserContext({ providerId, userId });
  }

  await saveProviderUserContext({
    ...nextContext,
    channels: {
      ...nextContext.channels,
      [`${channel.type}:${channel.id}`]: {
        type: channel.type,
        id: channel.id,
        lastActiveThreadId: nextActiveThreadId,
        updatedAt: new Date().toISOString(),
      },
    },
  });

  return syncBrowserSessionFromProviderContext({
    activeThreadId: nextActiveThreadId,
  });
};

const renameThreadState = async ({
  threadId,
  title,
}: {
  threadId: string;
  title: string;
}) => {
  const nextThreadId = threadId.trim();
  const nextTitle = title.trim().slice(0, 80);

  if (!nextThreadId) {
    throw new Error("Choose a thread before trying to rename it.");
  }

  if (!nextTitle) {
    throw new Error("Enter a thread name before saving.");
  }

  const { providerId, userId } = await ensureWebProviderContext();

  await renameProviderThread({
    providerId,
    userId,
    threadId: nextThreadId,
    title: nextTitle,
  });

  return syncBrowserSessionFromProviderContext({
    activeThreadId: requireBrowserSession().activeThreadId,
  });
};

const appendCommandHistoryToThread = async ({
  threadId,
  commandText,
  assistantReply,
}: {
  threadId: string;
  commandText: string;
  assistantReply?: string;
}) => {
  const { providerId, userId } = getWebIdentity();
  const providerContext = await loadOrCreateProviderUserContext({ providerId, userId });
  const targetThread = providerContext.threads.find((thread) => thread.id === threadId);

  if (!targetThread) {
    return null;
  }

  const currentState = await loadChatSession(threadId);
  const nextMessages = [
    ...currentState.messages,
    createUserMessage(commandText),
    ...(assistantReply ? [createAssistantMessage(assistantReply)] : []),
  ];
  const nextState = {
    ...currentState,
    messages: nextMessages,
  };

  await saveChatSession(threadId, nextState);
  const updatedAt = nextMessages.at(-1)?.createdAt || new Date().toISOString();
  const nextThreads = providerContext.threads
    .map((thread) =>
      thread.id === threadId
        ? {
            ...thread,
            title: thread.isTitleEdited
              ? thread.title
              : getThreadTitleFromMessages(nextMessages),
            updatedAt,
            messageCount: nextMessages.length,
          }
        : thread,
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  await saveProviderUserContext({
    ...providerContext,
    threads: nextThreads,
  });

  const nextSession = await syncBrowserSessionFromProviderContext({
    activeThreadId: threadId,
  });

  return {
    session: nextSession,
    thread: nextState,
  };
};

export const sendChatMessage = serverQuery(
  async (input: { content: string; threadId: string; model?: string }) =>
    sendMessageToThread(input),
  { method: "POST" },
);

export const handleConversationInput = serverQuery(
  async ({
    rawInput,
    threadId,
    model,
  }: {
    rawInput: string;
    threadId: string;
    model?: string;
  }): Promise<ConversationCommandExecution> => {
    const parsedInput = parseConversationInput(rawInput);

    if (!parsedInput) {
      throw new Error("Please enter a message before sending.");
    }

    const browserSession = requireBrowserSession();
    const { context: providerContext } = await ensureWebProviderContext();
    const sourceThreadId = threadId.trim() || browserSession.activeThreadId;
    const result = await executeConversationInput({
      input: parsedInput,
      model,
      context: {
        activeThreadId: sourceThreadId,
        threads: providerContext.threads,
      },
      actions: {
        createThread: async ({ isTemporary }) => {
          const state = await createAndPersistThread({ isTemporary });

          return {
            activeThreadId: state.activeThreadId,
            threads: state.threads,
            messages: state.session.messages,
            model: state.model,
          };
        },
        selectThread: async (nextThreadId) => {
          const state = await selectThreadState(nextThreadId);

          return {
            activeThreadId: state.activeThreadId,
            threads: state.threads,
            messages: state.session.messages,
            model: state.model,
          };
        },
        renameThread: async (input) => {
          const state = await renameThreadState(input);

          return {
            activeThreadId: state.activeThreadId,
            threads: state.threads,
            messages: state.session.messages,
            model: state.model,
          };
        },
        deleteThread: async (nextThreadId) => {
          const state = await deleteThreadState(nextThreadId);

          return {
            activeThreadId: state.activeThreadId,
            threads: state.threads,
            messages: state.session.messages,
            model: state.model,
          };
        },
        sendMessage: async (input) => {
          const state = await sendMessageToThread(input);

          return {
            activeThreadId: state.activeThreadId,
            threads: state.threads,
            messages: state.session.messages,
            model: state.model,
          };
        },
      },
    });

    if (parsedInput.kind === "command") {
      const latestSession = requireBrowserSession();
      const historyThreadId =
        result.kind === "state" &&
        sourceThreadId !== result.state.activeThreadId &&
        !latestSession.threads.some((thread) => thread.id === sourceThreadId)
          ? result.state.activeThreadId
          : sourceThreadId;
      const historyUpdate = await appendCommandHistoryToThread({
        threadId: historyThreadId,
        commandText: rawInput.trim(),
        assistantReply: result.notice,
      });

      if (historyUpdate && result.kind === "notice") {
        return {
          kind: "state" as const,
          state: {
            activeThreadId: historyThreadId,
            threads: historyUpdate.session.threads,
            messages: historyUpdate.thread.messages,
            model: historyUpdate.session.model,
          },
        };
      }

      if (
        historyUpdate &&
        result.kind === "state" &&
        historyThreadId === result.state.activeThreadId &&
        result.notice
      ) {
        return {
          kind: "state" as const,
          state: {
            activeThreadId: result.state.activeThreadId,
            threads: historyUpdate.session.threads,
            messages: historyUpdate.thread.messages,
            model: result.state.model ?? historyUpdate.session.model,
          },
        };
      }
    }

    return result;
  },
  { method: "POST" },
);

export const setChatModel = serverQuery(
  async (model: string) => {
    const { providerId, userId } = getWebIdentity();
    const browserSession = requireBrowserSession();
    const providerContext = await loadOrCreateProviderUserContext({ providerId, userId });
    const selectedModel = model.trim() || providerContext.selectedModel || DEFAULT_MODEL;

    await saveProviderUserContext({
      ...providerContext,
      selectedModel,
    });

    return syncBrowserSessionFromProviderContext({
      activeThreadId: browserSession.activeThreadId,
    });
  },
  { method: "POST" },
);

export const resetChatSession = serverQuery(
  async () => {
    const browserSession = requireBrowserSession();
    const { providerId, userId } = getWebIdentity();
    const sessionId = browserSession.activeThreadId;
    const nextState = createInitialChatState();
    const providerContext = await loadOrCreateProviderUserContext({ providerId, userId });
    const currentSummary = providerContext.threads.find((thread) => thread.id === sessionId);

    if (!currentSummary) {
      throw new Error("The active thread could not be found.");
    }

    await saveChatSession(sessionId, nextState);
    await saveProviderUserContext({
      ...providerContext,
      threads: providerContext.threads
        .map((thread) =>
          thread.id === sessionId
            ? {
                ...thread,
                title: createThreadSummary(sessionId).title,
                updatedAt: new Date().toISOString(),
                messageCount: nextState.messages.length,
                isTitleEdited: false,
              }
            : thread,
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    });

    return syncBrowserSessionFromProviderContext({
      activeThreadId: sessionId,
    });
  },
  { method: "POST" },
);

export const createChatThread = serverQuery(
  async ({ isTemporary }: { isTemporary?: boolean } = {}) =>
    createAndPersistThread({ isTemporary }),
  { method: "POST" },
);

export const selectChatThread = serverQuery(
  async (threadId: string) => selectThreadState(threadId),
  { method: "POST" },
);

export const deleteChatThread = serverQuery(
  async (threadId: string) => deleteThreadState(threadId),
  { method: "POST" },
);

export const renameChatThread = serverQuery(
  async (input: { threadId: string; title: string }) => renameThreadState(input),
  { method: "POST" },
);
