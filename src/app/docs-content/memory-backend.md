# Memory Backend

*familiar* handles memory retrieval and storage through a pluggable backend interface. The default behavior requires no configuration. Developers who need a richer or external memory store can swap the backend.

## How it works

Every conversation turn runs two memory operations:

- **Retrieve** — before the assistant responds, load relevant context from stored memory
- **Store** — after the turn, persist new facts and update the thread summary

Both operations are handled by the active backend. The familiar API surface does not change regardless of which backend is in use.

## Default backend

When no backend is configured, *familiar* uses its built-in pipeline:

- Facts and thread summaries are stored in Cloudflare Durable Objects
- Retrieval uses a staged pipeline: heuristic candidate selection, cheap-model AI selection, then context injection into the assistant prompt
- No configuration required

This is the backend active for all hosted *familiar* accounts.

## MemPalace backend

[MemPalace](https://github.com/chrisvdm/mempalace) is a Python memory server (ChromaDB + SQLite) that stores verbatim text chunks and a temporal knowledge graph. It is suited to developers who use *familiar* as the tool router for a personal software suite and want cross-suite semantic memory.

### Run the MemPalace server

```shell
pip install mempalace
python -m mempalace.mcp_server
```

The server runs at `http://localhost:8765` by default.

### Configure familiar to use it

Set these environment variables before starting *familiar*:

```text
FAMILIAR_MEMORY_BACKEND=mempalace
FAMILIAR_MEMORY_BACKEND_URL=http://localhost:8765
```

When `FAMILIAR_MEMORY_BACKEND=mempalace` is set, *familiar* routes all memory retrieve and store calls to the MemPalace server over HTTP. If the server is unreachable or returns an error, *familiar* falls back to the default backend silently — the turn completes normally.

## Build your own backend

The memory layer is defined by a TypeScript interface. If you self-host *familiar* and want to connect a different memory store, implement this interface:

```typescript
interface MemoryBackend {
  retrieve(params: MemoryRetrieveParams): Promise<string | null>;
  store(params: MemoryStoreParams): Promise<{ threadMemory: ThreadMemory; globalMemory: GlobalMemory }>;
  getThreadHistory(params: { userId: string; integrationId: string; threadId: string }): Promise<ChatMessage[]>;
  prune(params: { userId: string; integrationId: string; threadId: string }): Promise<void>;
}
```

`retrieve` returns a context string that *familiar* injects into the assistant prompt. `store` returns updated memory objects — *familiar* owns persisting them to storage. `prune` is called when a thread is deleted so backends can clean up their own data.

The backend is selected in `src/app/memory/memory.factory.ts`. Add a new branch there to wire in a custom implementation.

> [!NOTE]
> Building a custom backend requires modifying and self-hosting the *familiar* codebase. Hosted *familiar* accounts use the default backend only.