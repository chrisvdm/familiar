import { loadChatSession, saveChatSession } from "../chat/chat.storage.ts";
import {
  createEmptyGlobalMemory,
  type ChatMessage,
  type ChatSessionState,
  type ChatThreadSummary,
} from "../chat/shared.ts";
import { synthesizeUserProfile } from "../chat/chat.memory.ts";
import { createMemoryBackend } from "../memory/memory.factory.ts";
import { updateThreadSummaries, buildThreadSummary } from "./provider.threads.ts";
import type { ProviderUserContext } from "./provider.types.ts";
import { saveProviderUserContext } from "./provider.storage.ts";

export const refreshProviderMemories = async ({
  threadId,
  state,
  thread,
  context,
  isPrivate,
  timeZone,
  aiApiKey,
}: {
  threadId: string;
  state: ChatSessionState;
  thread: ChatThreadSummary;
  context: ProviderUserContext;
  isPrivate: boolean;
  timeZone?: string | null;
  aiApiKey?: string;
}) => {
  try {
    const memoryBackend = createMemoryBackend();
    const refreshed = await memoryBackend.store({
      userId: context.userId,
      integrationId: context.providerId,
      threadId,
      messages: state.messages,
      previousThreadMemory: state.memory,
      globalMemory: isPrivate ? createEmptyGlobalMemory() : context.globalMemory,
      timeZone,
      aiApiKey,
    });

    const nextThreadState = {
      ...state,
      memory: refreshed.threadMemory,
    };

    await saveChatSession(threadId, nextThreadState);

    const nextGlobalMemory = isPrivate ? context.globalMemory : refreshed.globalMemory;
    const nextThreads = updateThreadSummaries(
      context.threads,
      buildThreadSummary(thread, nextThreadState.messages),
    );

    const nextContext: ProviderUserContext = {
      ...context,
      globalMemory: nextGlobalMemory,
      threads: nextThreads,
    };

    await saveProviderUserContext(nextContext);

    return {
      state: nextThreadState,
      context: nextContext,
    };
  } catch (error) {
    console.warn("Unable to refresh provider memories", error);
    return {
      state,
      context,
    };
  }
};

const SYNTHESIS_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_SYNTHESIS_THREADS = 3;
const MAX_SYNTHESIS_MESSAGES = 40;

export const isSynthesisDue = (context: ProviderUserContext): boolean => {
  if (!context.nextSynthesis) {
    return true;
  }

  return new Date(context.nextSynthesis) <= new Date();
};

export const isCalibrationRequest = (message: string): boolean =>
  /\b(analys[ei](?:se|ze|s)? (my|of my) (behaviour|behavior|speech|communication|personality|style|writing)|how (do|would) i (come across|sound)|what (kind of person|personality) (am i|do i have)|how i (communicate|talk|write)|calibrat(e|ing|ion))\b/i.test(
    message,
  );

export const runProfileSynthesis = async ({
  context,
  timeZone,
  aiApiKey,
}: {
  context: ProviderUserContext;
  timeZone?: string | null;
  aiApiKey?: string;
}): Promise<ProviderUserContext> => {
  try {
    const recentThreads = [...context.threads]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_SYNTHESIS_THREADS);

    const allMessages: ChatMessage[] = [];

    for (const thread of recentThreads) {
      const session = await loadChatSession(thread.id);
      allMessages.push(...session.messages);
    }

    const messages = allMessages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, MAX_SYNTHESIS_MESSAGES);

    const updatedMemory = await synthesizeUserProfile({
      messages,
      globalMemory: context.globalMemory,
      timeZone,
      aiApiKey,
    });

    const now = new Date().toISOString();
    const nextSynthesis = new Date(Date.now() + SYNTHESIS_INTERVAL_MS).toISOString();

    return await saveProviderUserContext({
      ...context,
      globalMemory: updatedMemory,
      lastSynthesis: now,
      nextSynthesis,
    });
  } catch (error) {
    console.warn("Profile synthesis failed", error);
    const now = new Date().toISOString();
    const nextSynthesis = new Date(Date.now() + SYNTHESIS_INTERVAL_MS).toISOString();

    return await saveProviderUserContext({
      ...context,
      lastSynthesis: now,
      nextSynthesis,
    });
  }
};
