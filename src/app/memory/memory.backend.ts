import type { ChatMessage, MemoryFact, ThreadMemory, GlobalMemory } from "../chat/shared.ts";
import type { MemoryPolicy } from "../provider/provider.types.ts";

export type MemoryRetrievalResult = string | null;

export type MemoryRetrieveParams = {
  userId: string;
  integrationId: string;
  threadId: string;
  userMessage: string;
  messages: ChatMessage[];
  threadMemory: ThreadMemory;
  globalMemory: GlobalMemory;
  policy: MemoryPolicy;
  timeZone?: string | null;
  aiApiKey?: string;
};

export type MemoryStoreParams = {
  userId: string;
  integrationId: string;
  threadId: string;
  messages: ChatMessage[];
  previousThreadMemory: ThreadMemory;
  globalMemory: GlobalMemory;
  timeZone?: string | null;
  aiApiKey?: string;
};

export type MemoryStoreResult = {
  threadMemory: ThreadMemory;
  globalMemory: GlobalMemory;
};

export interface MemoryBackend {
  retrieve(params: MemoryRetrieveParams): Promise<MemoryRetrievalResult>;
  store(params: MemoryStoreParams): Promise<MemoryStoreResult>;
  // Infrastructure for the "drill deeper" path — wired now, not yet called by the retrieval pipeline.
  getThreadHistory(params: { userId: string; integrationId: string; threadId: string }): Promise<ChatMessage[]>;
  prune(params: { userId: string; integrationId: string; threadId: string }): Promise<void>;
}
