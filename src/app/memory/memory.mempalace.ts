import { env } from "cloudflare:workers";
import { createEmptyGlobalMemory, createEmptyThreadMemory } from "../chat/shared.ts";
import type {
  MemoryBackend,
  MemoryRetrieveParams,
  MemoryRetrievalResult,
  MemoryStoreParams,
  MemoryStoreResult,
} from "./memory.backend.ts";
import { DefaultMemoryBackend } from "./memory.default.ts";
import type { ChatMessage } from "../chat/shared.ts";

const mempalaceEnv = env as typeof env & {
  FAMILIAR_MEMORY_BACKEND_URL?: string;
};

export class MemPalaceMemoryBackend implements MemoryBackend {
  private fallback = new DefaultMemoryBackend();
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async retrieve(params: MemoryRetrieveParams): Promise<MemoryRetrievalResult> {
    try {
      const response = await fetch(`${this.baseUrl}/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        return this.fallback.retrieve(params);
      }

      const data = (await response.json()) as { context?: string | null };
      return data.context ?? null;
    } catch {
      return this.fallback.retrieve(params);
    }
  }

  async store(params: MemoryStoreParams): Promise<MemoryStoreResult> {
    try {
      const response = await fetch(`${this.baseUrl}/store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        return this.fallback.store(params);
      }

      const data = (await response.json()) as Partial<MemoryStoreResult>;
      return {
        threadMemory: data.threadMemory ?? createEmptyThreadMemory(),
        globalMemory: data.globalMemory ?? createEmptyGlobalMemory(),
      };
    } catch {
      return this.fallback.store(params);
    }
  }

  async getThreadHistory(params: {
    userId: string;
    integrationId: string;
    threadId: string;
  }): Promise<ChatMessage[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/threads/${params.threadId}/history`,
        { method: "GET" },
      );

      if (!response.ok) {
        return this.fallback.getThreadHistory(params);
      }

      const data = (await response.json()) as { messages?: ChatMessage[] };
      return data.messages ?? [];
    } catch {
      return this.fallback.getThreadHistory(params);
    }
  }

  async prune(params: {
    userId: string;
    integrationId: string;
    threadId: string;
  }): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/threads/${params.threadId}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        return;
      }
    } catch {
      return;
    }
  }
}

export const getMemPalaceBaseUrl = (): string =>
  mempalaceEnv.FAMILIAR_MEMORY_BACKEND_URL ?? "http://localhost:8765";
