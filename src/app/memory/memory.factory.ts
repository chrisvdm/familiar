import { env } from "cloudflare:workers";
import { DefaultMemoryBackend } from "./memory.default.ts";
import { MemPalaceMemoryBackend, getMemPalaceBaseUrl } from "./memory.mempalace.ts";
import type { MemoryBackend } from "./memory.backend.ts";

const factoryEnv = env as typeof env & {
  FAMILIAR_MEMORY_BACKEND?: string;
};

export const createMemoryBackend = (): MemoryBackend => {
  if (factoryEnv.FAMILIAR_MEMORY_BACKEND === "mempalace") {
    return new MemPalaceMemoryBackend(getMemPalaceBaseUrl());
  }

  return new DefaultMemoryBackend();
};
