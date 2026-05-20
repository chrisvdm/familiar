# Memory Backend

*familiar* handles memory retrieval and storage through a pluggable backend interface. The default behavior requires no configuration. Developers who need a richer or external memory store can swap the backend.

## Memory settings

### Private threads

Create a private thread when you want a conversation that stays completely local. Private threads keep their own transcript and thread-local memory, but they do **not** write into shared user memory and do not contribute to cross-thread recall.

To create a private thread, send `is_private: true` when creating the thread:

```json
POST /api/v1/threads
{
  "title": "Sensitive planning",
  "channel": { "type": "web", "id": "browser_session_abc" },
  "is_private": true
}
```

Then pass the returned `thread_id` on subsequent input calls.

### Inspect memory

You can read what *familiar* remembers through the API or the SDK.

**Read shared user memory:**

```text
GET /api/v1/users/:user_id/memory
```

**Read thread-local memory:**

```text
GET /api/v1/threads/:thread_id/memory?user_id=:user_id
```

SDK equivalents:

```typescript
// Shared memory
const { memory } = await familiar.memory.getUserMemory({ userId: "default" });

// Thread memory
const { memory } = await familiar.memory.getThreadMemory({ threadId: "thread_abc" });
```

> [!NOTE]
> Memory is read-only through the public API. There is no endpoint to edit or delete individual memory facts.

### Memory policy modes

*familiar* retrieves memory based on a policy mode stored per user. The default mode is `provider_user`, which means full cross-thread memory is retrieved for every turn.

The supported modes are:

| Mode | Behavior |
|---|---|
| `none` | No durable shared memory. Only the current request and thread-local context. |
| `thread` | Only thread-local memory. Cross-thread memory is blocked. |
| `provider_user` | **Default.** Full user-scoped global memory across all threads. |
| `custom_scope` | Retrieves memory under an explicit scope ID (for cross-integration sharing). |
| `external` | *familiar* does not retrieve its own memory. The integration supplies `external_memories` in the input payload. |

Memory policy is set internally and cannot be changed through the public API today.

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