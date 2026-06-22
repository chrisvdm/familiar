import { saveChatSession } from "../chat/chat.storage.ts";
import {
  createAssistantMessage,
  type ChatMessage,
  type ChatSessionState,
  type ChatThreadSummary,
  type PendingToolConfirmation,
} from "../chat/shared.ts";
import { MAX_MESSAGES_PER_THREAD } from "./provider.logic.ts";
import {
  updateThreadSummaries,
  buildThreadSummary,
  updateChannelState,
  updateThreadChannelState,
} from "./provider.threads.ts";
import { saveProviderUserContext } from "./provider.storage.ts";
import type { ProviderChannelInput, ProviderUserContext } from "./provider.types.ts";

export const saveConversationTurn = async ({
  threadId,
  currentState,
  assistantContent,
  toolMessages = [],
  pendingToolConfirmation,
  thread,
  currentContext,
  model,
  channel,
}: {
  threadId: string;
  currentState: ChatSessionState;
  assistantContent: string;
  toolMessages?: ChatMessage[];
  pendingToolConfirmation?: PendingToolConfirmation | null;
  thread: ChatThreadSummary;
  currentContext: ProviderUserContext;
  model: string;
  channel: ProviderChannelInput;
}) => {
  const messages = [
    ...currentState.messages,
    createAssistantMessage(assistantContent),
    ...toolMessages,
  ];

  if (messages.length > MAX_MESSAGES_PER_THREAD) {
    throw new Error(
      `Message limit reached (${MAX_MESSAGES_PER_THREAD}) for this thread. Start a new thread to continue.`,
    );
  }

  const nextThreadState: ChatSessionState = {
    ...currentState,
    messages,
    pendingToolConfirmation:
      pendingToolConfirmation === undefined
        ? currentState.pendingToolConfirmation
        : pendingToolConfirmation,
    activeToolShortcut: null,
  };
  const nextContext = {
    ...currentContext,
    selectedModel: model,
    threads: updateThreadSummaries(
      currentContext.threads,
      buildThreadSummary(thread, messages),
    ),
    channels: updateChannelState({
      context: currentContext,
      channel,
      threadId,
    }),
    threadChannels: updateThreadChannelState({
      context: currentContext,
      channel,
      threadId,
    }),
  };

  return Promise.all([
    saveChatSession(threadId, nextThreadState),
    saveProviderUserContext(nextContext),
  ]);
};
