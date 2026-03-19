"use server";

import { requestInfo, serverQuery } from "rwsdk/worker";

import {
  executeConversationInput,
  parseConversationInput,
  type ConversationCommandExecution,
  type ConversationThreadState,
} from "./conversation.engine";
import { DEFAULT_MODEL, resolveConversationTimeZone } from "./conversation.runtime";
import { loadChatSession, saveChatSession } from "./chat.storage";
import {
  createAssistantMessage,
  createInitialChatState,
  createThreadSummary,
  createUserMessage,
  getThreadTitleFromMessages,
} from "./shared";
import {
  getBrowserSessionIdFromRequest,
  persistBrowserSession as persistSessionState,
  type BrowserSession,
} from "../session/session";
import {
  createProviderThread,
  deleteProviderThread,
  handleProviderConversationInput,
  renameProviderThread,
  WEB_PROVIDER_ID,
} from "../provider/provider.service";
import {
  loadOrCreateProviderUserContext,
  saveProviderUserContext,
} from "../provider/provider.storage";
import type { ProviderChannelInput, ProviderUserContext } from "../provider/provider.types";

type WebThreadState = {
  activeThreadId: string;
  threads: ProviderUserContext["threads"];
  globalMemory: ProviderUserContext["globalMemory"];
  session: Awaited<ReturnType<typeof loadChatSession>>;
  model: string;
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

const getWebChannelType = () => {
  const referer = requestInfo.request.headers.get("Referer") || "";

  return referer.includes("/sandbox/messenger") ? "sandbox_messenger" : "web";
};

const getWebIdentity = () => {
  const browserSession = requireBrowserSession();

  return {
    providerId: WEB_PROVIDER_ID,
    userId:
      getBrowserSessionIdFromRequest(requestInfo.request) ||
      browserSession.activeThreadId,
    channel: {
      type: getWebChannelType(),
      id:
        getBrowserSessionIdFromRequest(requestInfo.request) ||
        browserSession.activeThreadId,
    } satisfies ProviderChannelInput,
  };
};

const getChannelKey = (channel: ProviderChannelInput) =>
  `${channel.type.trim().toLowerCase()}:${channel.id.trim()}`;

const getRequestTimeZone = () =>
  resolveConversationTimeZone(
    (requestInfo.request as Request & { cf?: { timezone?: string } }).cf?.timezone,
  );

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
        [getChannelKey(channel)]: {
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
    providerId,
    userId,
    channel,
    context,
  };
};

const syncWebState = async ({
  activeThreadId,
}: {
  activeThreadId: string;
}): Promise<WebThreadState> => {
  const { providerId, userId } = getWebIdentity();
  const providerContext = await loadOrCreateProviderUserContext({ providerId, userId });
  const threadSession = await loadChatSession(activeThreadId);
  const nextBrowserSession: BrowserSession = {
    activeThreadId,
    threads: providerContext.threads,
    globalMemory: providerContext.globalMemory,
    selectedModel: providerContext.selectedModel,
  };

  await persistBrowserSession(nextBrowserSession);

  return {
    activeThreadId,
    threads: providerContext.threads,
    globalMemory: providerContext.globalMemory,
    session: threadSession,
    model: providerContext.selectedModel || DEFAULT_MODEL,
  };
};

const createThreadState = async ({
  isTemporary = false,
}: {
  isTemporary?: boolean;
} = {}) => {
  const { providerId, userId, channel } = await ensureWebProviderContext();
  const created = await createProviderThread({
    providerId,
    userId,
    channel,
    isPrivate: isTemporary,
  });

  return syncWebState({ activeThreadId: created.thread_id });
};

const sendThreadMessage = async ({
  content,
  threadId,
  model,
}: {
  content: string;
  threadId: string;
  model?: string;
}) => {
  const message = content.trim();
  const targetThreadId = threadId.trim();

  if (!targetThreadId) {
    throw new Error("Choose a thread before sending a message.");
  }

  if (!message) {
    throw new Error("Please enter a message before sending.");
  }

  const { providerId, userId, channel } = await ensureWebProviderContext();
  const result = await handleProviderConversationInput({
    requestId: crypto.randomUUID(),
    providerConfig: {
      token: "",
    },
    input: {
      provider_id: providerId,
      user_id: userId,
      thread_id: targetThreadId,
      input: {
        kind: "text",
        text: message,
      },
      model,
      timezone: getRequestTimeZone(),
      channel,
      context: {
        external_memories: [],
      },
    },
  });

  return syncWebState({ activeThreadId: result.thread_id });
};

const selectThreadState = async (threadId: string) => {
  const targetThreadId = threadId.trim();

  if (!targetThreadId) {
    throw new Error("Choose a thread before trying to open it.");
  }

  const { context, channel } = await ensureWebProviderContext();
  const threadExists = context.threads.some((thread) => thread.id === targetThreadId);

  if (!threadExists) {
    throw new Error("That thread is no longer available.");
  }

  await saveProviderUserContext({
    ...context,
    channels: {
      ...context.channels,
      [getChannelKey(channel)]: {
        type: channel.type,
        id: channel.id,
        lastActiveThreadId: targetThreadId,
        updatedAt: new Date().toISOString(),
      },
    },
  });

  return syncWebState({ activeThreadId: targetThreadId });
};

const deleteThreadState = async (threadId: string) => {
  const targetThreadId = threadId.trim();

  if (!targetThreadId) {
    throw new Error("Choose a thread before trying to delete it.");
  }

  const { browserSession, providerId, userId, channel, context } =
    await ensureWebProviderContext();

  if (!context.threads.some((thread) => thread.id === targetThreadId)) {
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
      [getChannelKey(channel)]: {
        type: channel.type,
        id: channel.id,
        lastActiveThreadId: nextActiveThreadId,
        updatedAt: new Date().toISOString(),
      },
    },
  });

  return syncWebState({ activeThreadId: nextActiveThreadId });
};

const renameThreadState = async ({
  threadId,
  title,
}: {
  threadId: string;
  title: string;
}) => {
  const targetThreadId = threadId.trim();
  const nextTitle = title.trim().slice(0, 80);

  if (!targetThreadId) {
    throw new Error("Choose a thread before trying to rename it.");
  }

  if (!nextTitle) {
    throw new Error("Enter a thread name before saving.");
  }

  const { providerId, userId } = await ensureWebProviderContext();

  await renameProviderThread({
    providerId,
    userId,
    threadId: targetThreadId,
    title: nextTitle,
  });

  return syncWebState({
    activeThreadId: requireBrowserSession().activeThreadId,
  });
};

const appendCommandHistory = async ({
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

  await saveChatSession(threadId, {
    ...currentState,
    messages: nextMessages,
  });

  await saveProviderUserContext({
    ...providerContext,
    threads: providerContext.threads
      .map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              title: thread.isTitleEdited
                ? thread.title
                : getThreadTitleFromMessages(nextMessages),
              updatedAt: nextMessages.at(-1)?.createdAt || new Date().toISOString(),
              messageCount: nextMessages.length,
            }
          : thread,
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  });

  const state = await syncWebState({ activeThreadId: threadId });

  return {
    state,
    messages: nextMessages,
  };
};

export const sendChatMessage = serverQuery(
  async (input: { content: string; threadId: string; model?: string }) =>
    sendThreadMessage(input),
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
    const { context } = await ensureWebProviderContext();
    const sourceThreadId = threadId.trim() || browserSession.activeThreadId;
    const result = await executeConversationInput({
      input: parsedInput,
      model,
      context: {
        activeThreadId: sourceThreadId,
        threads: context.threads,
      },
      actions: {
        createThread: async ({ isTemporary }) => {
          const state = await createThreadState({ isTemporary });
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
          const state = await sendThreadMessage(input);
          return {
            activeThreadId: state.activeThreadId,
            threads: state.threads,
            messages: state.session.messages,
            model: state.model,
          };
        },
      },
    });

    if (parsedInput.kind !== "command") {
      return result;
    }

    const latestSession = requireBrowserSession();
    const historyThreadId =
      result.kind === "state" &&
      sourceThreadId !== result.state.activeThreadId &&
      !latestSession.threads.some((thread) => thread.id === sourceThreadId)
        ? result.state.activeThreadId
        : sourceThreadId;
    const historyUpdate = await appendCommandHistory({
      threadId: historyThreadId,
      commandText: rawInput.trim(),
      assistantReply: result.kind === "notice" ? result.notice : result.notice,
    });

    if (historyUpdate && result.kind === "notice") {
      return {
        kind: "state",
        state: {
          activeThreadId: historyUpdate.state.activeThreadId,
          threads: historyUpdate.state.threads,
          messages: historyUpdate.messages,
          model: historyUpdate.state.model,
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
        kind: "state",
        state: {
          activeThreadId: result.state.activeThreadId,
          threads: historyUpdate.state.threads,
          messages: historyUpdate.messages,
          model: result.state.model ?? historyUpdate.state.model,
        },
      };
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

    return syncWebState({ activeThreadId: browserSession.activeThreadId });
  },
  { method: "POST" },
);

export const resetChatSession = serverQuery(
  async () => {
    const browserSession = requireBrowserSession();
    const { providerId, userId } = getWebIdentity();
    const activeThreadId = browserSession.activeThreadId;
    const nextState = createInitialChatState();
    const providerContext = await loadOrCreateProviderUserContext({ providerId, userId });

    if (!providerContext.threads.some((thread) => thread.id === activeThreadId)) {
      throw new Error("The active thread could not be found.");
    }

    await saveChatSession(activeThreadId, nextState);
    await saveProviderUserContext({
      ...providerContext,
      threads: providerContext.threads
        .map((thread) =>
          thread.id === activeThreadId
            ? {
                ...thread,
                title: createThreadSummary(activeThreadId).title,
                updatedAt: new Date().toISOString(),
                messageCount: nextState.messages.length,
                isTitleEdited: false,
              }
            : thread,
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    });

    return syncWebState({ activeThreadId });
  },
  { method: "POST" },
);

export const createChatThread = serverQuery(
  async ({ isTemporary }: { isTemporary?: boolean } = {}) =>
    createThreadState({ isTemporary }),
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
