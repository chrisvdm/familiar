# familiar Memory Backend

## Why This Document Exists

familiar's memory system handles two distinct operations: retrieving relevant context before a turn, and persisting extracted facts after one. Both operations were previously hardwired to familiar's built-in Durable Objects pipeline.

This document describes the `MemoryBackend` interface that decouples those operations from their implementation, making the memory layer pluggable. The default behavior is unchanged. A developer who needs richer or external memory can swap the backend without touching familiar's core logic.

Related documents:

- `docs/blueprints/architecture-foundations.md` — memory policy modes and capture/retrieval rules
- `docs/blueprints/conversation-lifecycle.md` — where memory operations sit in the turn lifecycle

## 2000ft View

The memory backend is an internal abstraction. Integrators do not interact with it directly — the familiar API surface is unchanged. The backend is selected at runtime from an environment variable.

Two backends exist:

**Default backend** wraps familiar's built-in pipeline: heuristic candidate selection, cheap-model AI selection, expensive-model answer generation. Facts are stored in Cloudflare Durable Objects. This is the only backend active when no environment variable is set.

**MemPalace backend** routes memory operations to a locally-running MemPalace HTTP server (Python, ChromaDB + SQLite). If the server is unreachable or returns an error, it falls back to the default backend silently. This backend is intended for developers who use familiar as the tool router for a personal software suite and want a richer, cross-suite semantic memory store.

## System Flow

### Retrieve (before a turn)

```
POST /api/v1/input
  → resolve thread and policy scope
  → selectProviderGlobalMemory()          ← policy scoping happens here, before backend
  → memoryBackend.retrieve()
      DefaultMemoryBackend: buildMemoryContext() → cheap-model selection → context string
      MemPalaceMemoryBackend: POST /retrieve → context string (fallback on error)
  → context string injected into assistant prompt
```

### Store (after a turn)

```
turn completes
  → refreshProviderMemories()
  → memoryBackend.store()
      DefaultMemoryBackend: refreshMemories() → ThreadMemory + GlobalMemory
      MemPalaceMemoryBackend: POST /store → ThreadMemory + GlobalMemory (fallback on error)
  → caller persists ThreadMemory to ChatSessionDO
  → caller persists GlobalMemory to ProviderUserContextDO
```

### Prune (on thread deletion)

```
DELETE /api/v1/threads/:thread_id
  → deleteChatSession()                   ← always runs, removes DO
  → memoryBackend.prune()
      DefaultMemoryBackend: no-op (DO already cleaned up above)
      MemPalaceMemoryBackend: DELETE /threads/:threadId (silent on error)
```

### getThreadHistory (infrastructure only)

```
memoryBackend.getThreadHistory()
  DefaultMemoryBackend: loadChatSession() → messages[]
  MemPalaceMemoryBackend: GET /threads/:threadId/history → messages[] (fallback on error)
```

This method is part of the interface contract but is not yet called by the retrieval pipeline. It is infrastructure for a follow-on "drill deeper" feature where the AI selector can request the full message history of a past thread.

## Interface Contract

```typescript
// src/app/memory/memory.backend.ts

interface MemoryBackend {
  retrieve(params: MemoryRetrieveParams): Promise<string | null>;
  store(params: MemoryStoreParams): Promise<{ threadMemory: ThreadMemory; globalMemory: GlobalMemory }>;
  getThreadHistory(params: { userId: string; integrationId: string; threadId: string }): Promise<ChatMessage[]>;
  prune(params: { userId: string; integrationId: string; threadId: string }): Promise<void>;
}
```

**`MemoryRetrieveParams`** carries: `userId`, `integrationId`, `threadId`, `userMessage`, `messages`, `threadMemory`, `globalMemory` (already policy-scoped), `policy`, `timeZone`.

**`MemoryStoreParams`** carries: `userId`, `integrationId`, `threadId`, `messages`, `previousThreadMemory`, `globalMemory`, `timeZone`.

**`store` returns** the updated `ThreadMemory` and `GlobalMemory`. The caller owns persisting them to Durable Objects — the backend does not write to DOs directly.

## Backend Selection

```typescript
// src/app/memory/memory.factory.ts
createMemoryBackend() → MemoryBackend
```

Reads `FAMILIAR_MEMORY_BACKEND` from the environment. If it equals `"mempalace"`, returns a `MemPalaceMemoryBackend`. Otherwise returns a `DefaultMemoryBackend`.

| Environment variable | Value | Effect |
|---|---|---|
| `FAMILIAR_MEMORY_BACKEND` | `"mempalace"` | Use MemPalace backend |
| `FAMILIAR_MEMORY_BACKEND` | unset or any other value | Use default backend |
| `FAMILIAR_MEMORY_BACKEND_URL` | HTTP URL | MemPalace server address (default: `http://localhost:8765`) |

## MemPalace Backend

The MemPalace backend calls a locally-running MemPalace server over HTTP. MemPalace is a Python service (ChromaDB + SQLite) that stores verbatim text chunks and a temporal knowledge graph.

**Endpoint mapping:**

| Backend method | HTTP call |
|---|---|
| `retrieve` | `POST /retrieve` |
| `store` | `POST /store` |
| `getThreadHistory` | `GET /threads/:threadId/history` |
| `prune` | `DELETE /threads/:threadId` |

**Fallback behavior:** any network error or non-2xx response causes the MemPalace backend to call the equivalent `DefaultMemoryBackend` method instead. The caller sees no difference. Errors are swallowed — nothing is logged to the user.

**Running MemPalace:**

```sh
pip install mempalace
python -m mempalace.mcp_server
```

Set `FAMILIAR_MEMORY_BACKEND=mempalace` in your environment before starting familiar.

## Invariants and Constraints

1. The default backend must be behaviourally identical to the pre-interface code path. No regressions.
2. Policy scoping (`selectProviderGlobalMemory`) happens before any backend call. Backends receive an already-scoped `globalMemory`.
3. `store` returns updated memories. The caller owns DO persistence. Backends do not write to Durable Objects.
4. The MemPalace backend must never hard-fail. Any error falls back to the default backend.
5. `getThreadHistory` is part of the contract but unused by the retrieval pipeline until the drill-deeper follow-on is implemented.
6. `prune` must be called on thread deletion so backends can clean up their own storage.
7. No memory of the selected backend leaks into the familiar API surface. The HTTP API is unchanged.

## Directory Mapping

```
src/app/memory/
  memory.backend.ts      — MemoryBackend interface + MemoryRetrieveParams + MemoryStoreParams types
  memory.default.ts      — DefaultMemoryBackend
  memory.mempalace.ts    — MemPalaceMemoryBackend + getMemPalaceBaseUrl()
  memory.factory.ts      — createMemoryBackend()

src/app/provider/
  provider.service.ts    — two call sites: retrieve (~line 2059), store (~line 1611)
```

## Learnings and Anti-Patterns

**Do not pass raw DO stubs into backends.** Backends receive structured params, not Durable Object references. This keeps backends portable and independently testable.

**Do not collapse policy scoping into the backend.** Memory policy (`none`, `thread`, `provider_user`, `custom_scope`, `external`) is resolved by `selectProviderGlobalMemory` before the backend is called. If a backend tried to re-apply policy, it would need to know about familiar's internal policy model — breaking the abstraction.

**MemPalace stores verbatim text; familiar stores structured facts.** The MemPalace adapter maps familiar's `ThreadMemory` and `GlobalMemory` types back from the HTTP response, using empty defaults for fields MemPalace does not return. There is inherent lossiness in this translation. The MemPalace backend is suited to use cases where semantic search over a large memory corpus matters more than structured fact recall.
