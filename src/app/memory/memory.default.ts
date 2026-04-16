import { buildMemoryContext, refreshMemories } from "../chat/chat.memory.ts";
import { loadChatSession } from "../chat/chat.storage.ts";
import type {
  MemoryBackend,
  MemoryRetrieveParams,
  MemoryStoreParams,
  MemoryStoreResult,
} from "./memory.backend.ts";
import type { ChatMessage } from "../chat/shared.ts";

export class DefaultMemoryBackend implements MemoryBackend {
  async retrieve(params: MemoryRetrieveParams) {
    return buildMemoryContext({
      userMessage: params.userMessage,
      messages: params.messages,
      threadMemory: params.threadMemory,
      globalMemory: params.globalMemory,
      timeZone: params.timeZone,
      // --GROK--: passes the drill-deeper callback so buildMemoryContext can fetch
      // full thread message history when the AI selector emits thread_drill_ids.
      getThreadHistory: async (threadId) => {
        const history = await this.getThreadHistory({
          userId: params.userId,
          integrationId: params.integrationId,
          threadId,
        });
        return history;
      },
    });
  }

  async store(params: MemoryStoreParams): Promise<MemoryStoreResult> {
    return refreshMemories({
      threadId: params.threadId,
      messages: params.messages,
      previousThreadMemory: params.previousThreadMemory,
      globalMemory: params.globalMemory,
      timeZone: params.timeZone,
    });
  }

  async getThreadHistory(params: {
    userId: string;
    integrationId: string;
    threadId: string;
  }): Promise<ChatMessage[]> {
    const session = await loadChatSession(params.threadId);
    return session.messages;
  }

  async prune(_params: {
    userId: string;
    integrationId: string;
    threadId: string;
  }): Promise<void> {
    // DO cleanup is handled by the caller via deleteChatSession
  }
}
