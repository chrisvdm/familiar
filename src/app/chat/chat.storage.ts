import { env } from "cloudflare:workers";

import {
  normalizeChatSessionState,
  type ChatMessage,
  type ChatSessionState,
  type PendingToolConfirmation,
} from "./shared.ts";
import { MAX_MESSAGES_PER_THREAD } from "../provider/provider.logic.ts";

const getChatStub = (sessionId: string) => {
  const id = env.CHAT_SESSIONS.idFromName(sessionId);
  return env.CHAT_SESSIONS.get(id);
};

export const loadChatSession = async (sessionId: string) => {
  const result = (await getChatStub(sessionId).getSession()) as {
    value: ChatSessionState;
  };

  return normalizeChatSessionState(result.value);
};

export const saveChatSession = async (
  sessionId: string,
  state: ChatSessionState,
) => {
  const normalizedState = normalizeChatSessionState(state);

  await getChatStub(sessionId).saveSession(normalizedState);
  return normalizedState;
};

export const deleteChatSession = async (sessionId: string) => {
  await getChatStub(sessionId).revokeSession();
};

export const saveThreadMessages = async ({
  threadId,
  currentState,
  messages,
  pendingToolConfirmation,
}: {
  threadId: string;
  currentState: ChatSessionState;
  messages: ChatMessage[];
  pendingToolConfirmation?: PendingToolConfirmation | null;
}) => {
  if (currentState.messages.length + messages.length > MAX_MESSAGES_PER_THREAD) {
    throw new Error(
      `Message limit reached (${MAX_MESSAGES_PER_THREAD}) for this thread. Start a new thread to continue.`,
    );
  }

  const nextState: ChatSessionState = {
    ...currentState,
    messages: [...currentState.messages, ...messages],
    pendingToolConfirmation:
      pendingToolConfirmation === undefined
        ? currentState.pendingToolConfirmation
        : pendingToolConfirmation,
    activeToolShortcut: null,
  };

  await saveChatSession(threadId, nextState);
  return nextState;
};
