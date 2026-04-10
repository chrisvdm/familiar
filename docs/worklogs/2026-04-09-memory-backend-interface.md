# Memory Backend Interface

## Investigation: Current Memory Seams

We audited the existing memory system to understand what a backend interface would need to cover. The memory pipeline has two clearly distinct operations that happen at different points in the conversation lifecycle.

**Retrieval** (`buildMemoryContext` in `chat.memory.ts`): called before the AI responds. Takes the user's message, current thread state, and global memory. Runs a staged pipeline — heuristic candidate selection, cheap-model AI selection, then formats a context string injected into the assistant prompt. Returns `string | null`.

**Extraction/store** (`refreshMemories` in `chat.memory.ts`): called after the AI responds, in `provider.service.ts`. Takes the full thread messages, previous thread memory, and global memory. Calls the extraction AI to produce `ThreadMemory` and `GlobalMemory` updates, then persists both — thread memory into `ChatSessionDO` and global memory into `ProviderUserContextDO`.

The call sites are:
- `provider.service.ts:2059` — calls `buildMemoryContext` before routing
- `provider.service.ts:1611` — calls `refreshMemories` after a turn

**One gap noted:** the "drill deeper into a thread" path — where the AI could request full thread history based on a summary — does not exist as a first-class operation yet. Thread summaries are surfaced as candidates during retrieval but the system cannot yet retrieve the full message history of a past thread on demand. This is worth adding to the interface as `getThreadHistory`.

**Memory storage topology:**
- Thread memory lives in `ChatSessionDO` (one DO per thread)
- Global memory lives in `ProviderUserContextDO` (one DO per provider+user pair)
- The current design is fully self-contained within Cloudflare Durable Objects

**MemPalace constraints:** Python-only, runs as a local service (ChromaDB + SQLite). No npm package. Integration requires calling over HTTP. We confirmed the adapter pattern: zero-config users hit the default backend; MemPalace users run a local Python MCP server and set an env var.

## RFC: Pluggable Memory Backend Interface

### 2000ft View

We want to introduce a `MemoryBackend` interface that wraps familiar's memory operations behind a stable contract. The default implementation is the current Durable Objects + AI pipeline — no behavioural change for anyone not opting in. A second `MemPalaceBackend` adapter implements the same contract by calling a locally-running MemPalace HTTP server.

The goal is developer-facing extensibility: a developer building a large personal software suite with familiar can swap in MemPalace for richer, cross-suite semantic memory without touching familiar's internals. If they don't configure a backend, they see nothing new.

The interface is purely internal to familiar. Integrators interact with familiar's existing `POST /api/v1/input` API unchanged. The backend is selected at runtime based on an env var (`FAMILIAR_MEMORY_BACKEND`).

### Behaviour Spec

**GIVEN** a developer does not set `FAMILIAR_MEMORY_BACKEND`  
**WHEN** familiar handles a conversation turn  
**THEN** memory behaves exactly as today — no visible change

**GIVEN** a developer sets `FAMILIAR_MEMORY_BACKEND=mempalace` and `FAMILIAR_MEMORY_BACKEND_URL=http://localhost:8765`  
**WHEN** familiar handles a conversation turn  
**THEN** retrieval and storage are routed through the MemPalace HTTP server

**GIVEN** a developer configures MemPalace backend but the server is unreachable  
**WHEN** familiar handles a conversation turn  
**THEN** familiar falls back to the default backend and continues (degraded mode, not a hard failure)

**GIVEN** the AI retrieval step identifies a thread summary as highly relevant  
**WHEN** `getThreadHistory` is called for that thread  
**THEN** the backend returns the full message list for that thread (default: reads from ChatSessionDO; MemPalace: queries the server)

### Interface Definition

```typescript
// src/app/memory/memory.backend.ts

export type MemoryRetrievalResult = string | null;

export type MemoryStoreParams = {
  userId: string;
  integrationId: string;
  threadId: string;
  threadUpdate: {
    summary: string;
    keywords: string[];
    facts: MemoryFact[];
  };
  globalFacts: MemoryFact[];
};

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
};

export interface MemoryBackend {
  retrieve(params: MemoryRetrieveParams): Promise<MemoryRetrievalResult>;
  store(params: MemoryStoreParams): Promise<{ threadMemory: ThreadMemory; globalMemory: GlobalMemory }>;
  // Infrastructure for the "drill deeper" path — wired now, not yet called by the retrieval pipeline.
  // A follow-on worklog will update the AI selector to emit thread_drill_ids and use this.
  getThreadHistory(params: { userId: string; integrationId: string; threadId: string }): Promise<ChatMessage[]>;
  prune(params: { userId: string; integrationId: string; threadId: string }): Promise<void>;
}
```

**Note on `store` return:** `store` returns updated `ThreadMemory` and `GlobalMemory` so the caller can persist them to Durable Objects. The default backend does the AI extraction and returns the result. The MemPalace backend calls the MemPalace server and maps the response back into familiar's types.

### Implementation Breakdown

```
[NEW] src/app/memory/
  memory.backend.ts          — interface definition + types
  memory.default.ts          — DefaultMemoryBackend (wraps current refreshMemories + buildMemoryContext)
  memory.mempalace.ts        — MemPalaceMemoryBackend (HTTP adapter)
  memory.factory.ts          — createMemoryBackend() factory (reads env, returns correct backend)

[MODIFY] src/app/provider/provider.service.ts
  — replace direct calls to buildMemoryContext / refreshMemories with backend.retrieve / backend.store
  — pass backend instance through from factory (injected at request level or module level)

[NO CHANGE] src/app/chat/chat.memory.ts — stays as-is, consumed by DefaultMemoryBackend
[NO CHANGE] src/app/chat/shared.ts — types unchanged
[NO CHANGE] provider API surface — no changes to HTTP endpoints
```

### Directory & File Structure

```
src/app/
  memory/
    memory.backend.ts        # interface + shared param types
    memory.default.ts        # DefaultMemoryBackend
    memory.mempalace.ts      # MemPalaceMemoryBackend
    memory.factory.ts        # createMemoryBackend()
  provider/
    provider.service.ts      # modified to use MemoryBackend
```

### Invariants & Constraints

1. The default backend must be behaviourally identical to the current code path — no regressions.
2. The MemPalace adapter must never cause a hard failure if the server is unreachable — fall back silently.
3. `store` must always return updated `ThreadMemory` and `GlobalMemory` regardless of backend — the caller owns persistence to DOs.
4. The interface does not expose familiar's internal DO topology to the adapter — adapters receive structured params, not DO stubs.
5. Memory policy (`none`, `thread`, `provider_user`, `custom_scope`, `external`) is resolved before calling the backend — the backend receives an already-scoped `globalMemory`.
6. `getThreadHistory` is infrastructure for the "drill deeper" path. It is part of the interface contract so all backends must implement it, but the retrieval pipeline does not yet call it. The follow-on worklog will update the AI selector prompt to emit `thread_drill_ids[]` and extend `DefaultMemoryBackend.retrieve` to fetch and append that history to the context string.
7. `prune` must be called whenever a thread is deleted so backends can clean up their own storage (e.g. MemPalace drawers scoped to that thread).

### System Flow Delta

**Before:**
`provider.service.ts` → `buildMemoryContext()` (retrieval)
`provider.service.ts` → `refreshMemories()` (store) → saves to ChatSessionDO + ProviderUserContextDO

**After:**
`provider.service.ts` → `backend.retrieve()` → internally calls `buildMemoryContext()` (default) or HTTP (MemPalace)
`provider.service.ts` → `backend.store()` → returns updated memories → service saves to DOs

### Tasks

- [ ] Create `src/app/memory/memory.backend.ts` with interface + param types
- [ ] Create `src/app/memory/memory.default.ts` wrapping `buildMemoryContext` + `refreshMemories`
- [ ] Create `src/app/memory/memory.factory.ts` reading `FAMILIAR_MEMORY_BACKEND` env var
- [ ] Create `src/app/memory/memory.mempalace.ts` with HTTP adapter (fallback on error)
- [ ] Modify `provider.service.ts` retrieve call site to use `backend.retrieve()`
- [ ] Modify `provider.service.ts` store call site to use `backend.store()`
- [x] Create `src/app/memory/memory.backend.ts` with interface + param types
- [x] Create `src/app/memory/memory.default.ts` wrapping `buildMemoryContext` + `refreshMemories`
- [x] Create `src/app/memory/memory.factory.ts` reading `FAMILIAR_MEMORY_BACKEND` env var
- [x] Create `src/app/memory/memory.mempalace.ts` with HTTP adapter (fallback on error)
- [x] Modify `provider.service.ts` retrieve call site to use `backend.retrieve()`
- [x] Modify `provider.service.ts` store call site to use `backend.store()`
- [ ] Manual verification

## Implementation Notes

`MemoryStoreParams` was corrected during implementation — the RFC spec had `threadUpdate` + `globalFacts` which was insufficient for `refreshMemories`. The final params pass `messages`, `previousThreadMemory`, and `globalMemory` directly, matching the existing call signature exactly.

`createEmptyGlobalMemory` and `createEmptyThreadMemory` import from `shared.ts`, not `chat.memory.ts` — caught by type-check.

### Follow-on: Drill-Deeper Retrieval (separate worklog)

- [ ] Update `selectMemoryContextWithAi` selector prompt to emit `thread_drill_ids[]`
- [ ] Update `MemorySelectorResponse` type to include `thread_drill_ids`
- [ ] Extend `DefaultMemoryBackend.retrieve` to call `getThreadHistory` for selected thread IDs and append full history as a new context section
- [ ] Update MemPalace adapter `retrieve` to do the same via its HTTP call
