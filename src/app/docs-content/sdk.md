# SDK

`familiar-sdk` is the JavaScript and TypeScript client for the *familiar* API.

Use the SDK when you want to send input, sync tools, or manage integrations from your own code rather than through the CLI or raw HTTP calls.

## Install

```shell
npm install familiar-sdk
```

Works in Node 18+, Deno, Bun, and modern browsers. Zero runtime dependencies.

## Quick start

```typescript
import { Familiar } from "familiar-sdk";

const familiar = new Familiar({ token: "fam_your_token" });

const result = await familiar.input({
  text: "Update the client spreadsheet",
  channel: { type: "web", id: "session_abc" },
});

console.log(result.messages.at(-1)?.content);
```

## Create an account

If you do not have a token yet, create one from code:

```typescript
import { Familiar } from "familiar-sdk";

const { account, token } = await Familiar.createAccount();
console.log(token.value); // store this — shown once
```

## Set your AI provider key

Before *familiar* can process messages, each integration needs an OpenRouter key:

```typescript
await familiar.integration.update({
  aiApiKey: "sk-or-v1-your_openrouter_key",
});
```

Get a key at [openrouter.ai/keys](https://openrouter.ai/keys).

## Send input

Send a conversation turn and get the assistant's response:

```typescript
const result = await familiar.input({
  text: "Start the Acme import",
  channel: { type: "web", id: "session_abc" },
});

// result.messages — the full turn including user message and assistant reply
// result.threadId — the thread this turn belongs to
// result.execution — whether a tool was called and its state
```

Pass `threadId` to continue an existing thread:

```typescript
const result = await familiar.input({
  text: "What is the status?",
  channel: { type: "web", id: "session_abc" },
  threadId: "thread_abc",
});
```

## Simulate a turn

Preview what *familiar* would do without persisting anything:

```typescript
const result = await familiar.simulate({
  text: "Update the client spreadsheet",
  channel: { type: "web", id: "session_abc" },
});

// result.response.type — "direct_reply", "clarification", or "tool_call"
// result.response.content — the assistant message that would be sent
// result.response.reasoning — why familiar chose this action
// result.model — which model made the decision
```

## Stream a response

Receive the assistant response as an SSE stream, event by event:

```typescript
for await (const event of familiar.inputStream({
  text: "Tell me a story",
  channel: { type: "web", id: "session_abc" },
})) {
  if (event.type === "chunk") {
    process.stdout.write(event.content);
  }
  if (event.type === "done") {
    console.log("\n[done]");
  }
}
```

## Sync tools

Tell *familiar* which tools the current integration should use:

```typescript
await familiar.tools.sync({
  tools: [
    {
      toolName: "spreadsheet.update_row",
      description: "Update a row in the spreadsheet",
      inputSchema: {
        type: "object",
        properties: {
          row_id: { type: "string" },
          values: { type: "object" },
        },
        required: ["row_id", "values"],
      },
    },
  ],
});
```

Run this whenever tool definitions change. You can also pass `tools` directly on `input()` to sync and use tools in one call:

```typescript
await familiar.input({
  text: "Update row 5",
  channel: { type: "web", id: "session_abc" },
  tools: [{ toolName: "spreadsheet.update_row", description: "...", inputSchema: {} }],
});
```

## Check integration health

```typescript
const health = await familiar.tools.health();

console.log(health.overall); // "healthy", "warning", or "degraded"
console.log(health.tools.count);     // total synced tools
console.log(health.tools.active);    // active tools
console.log(health.executor.recent_failures); // executor failures in last 24h
```

## Inspect and update the integration

```typescript
// Get the current integration config
const integration = await familiar.integration.get();
console.log(integration.aiApiKeySet); // true or false
console.log(integration.baseUrl);     // executor base URL or null

// Update the executor base URL
await familiar.integration.update({
  baseUrl: "https://your-executor.example.com",
});

// Clear the executor URL
await familiar.integration.update({
  baseUrl: null,
});
```

## Get integration status and account usage

```typescript
const status = await familiar.integration.status();

console.log(status.account.plan);                  // "free" or "paid"
console.log(status.account.actionCount);           // total actions used
console.log(status.account.freeActionsRemaining);  // remaining free actions
console.log(status.runtime.toolCount);             // synced tools
console.log(status.runtime.threadCount);           // active threads
```

## Read memory

```typescript
// Shared user memory
const { memory } = await familiar.memory.getUserMemory({ userId: "default" });

// Thread-local memory
const { memory } = await familiar.memory.getThreadMemory({ threadId: "thread_abc" });
```

## Manage threads

```typescript
// List threads
const { threads } = await familiar.threads.list();

// Create a thread
const { threadId } = await familiar.threads.create({
  title: "Q2 planning",
  channel: { type: "web", id: "session_abc" },
});

// Create a private thread
const { threadId } = await familiar.threads.create({
  title: "Private session",
  channel: { type: "web", id: "session_abc" },
  isPrivate: true,
});

// Rename a thread
await familiar.threads.update({
  threadId: "thread_abc",
  title: "New title",
});

// Delete a thread
await familiar.threads.delete({ threadId: "thread_abc" });
```

## Query audit events

```typescript
const { events } = await familiar.audit.events({ limit: 20 });

// Filter by status or event type
const { events: errors } = await familiar.audit.events({
  status: "error",
  limit: 10,
});
```

## Error handling

All errors throw a `FamiliarError` with a `code` field:

```typescript
import { Familiar, FamiliarError } from "familiar-sdk";

try {
  await familiar.input({
    text: "hello",
    channel: { type: "web", id: "session_abc" },
  });
} catch (err) {
  if (err instanceof FamiliarError) {
    console.log(err.code);    // e.g. "configuration_required"
    console.log(err.message); // human-readable explanation
    console.log(err.status);  // HTTP status code
  }
}
```

Common error codes:

| Code | Meaning |
|---|---|
| `unauthenticated` | Missing or invalid token |
| `configuration_required` | No AI provider key set on the integration |
| `invalid_request` | Bad request payload |
| `not_found` | Thread or resource not found |
| `rate_limited` | Too many requests |

## API reference

### Create a new account 

`Familiar.createAccount({ host? })`

Static method. Creates a new account. No token required. Returns `{ account, token }`. The token value is shown once — store it immediately.

### Create a new client instance 

`new Familiar({ token, host? })`

Create a client instance. `host` defaults to the hosted *familiar* instance. Override it for local development:

```typescript
const familiar = new Familiar({
  token: "fam_your_token",
  host: "http://localhost:5173",
});
```

### Send a conversation input
`familiar.input({ text, channel, userId?, threadId?, integrationId?, tools? })`

Send a conversation turn. Returns `InputResult`.

| Field | Type | Required |
|---|---|---|
| `text` | `string` | yes |
| `channel` | `{ type: string; id: string; name?: string }` | yes |
| `userId` | `string` | no |
| `threadId` | `string` | no |
| `integrationId` | `string` | no |
| `tools` | `Tool[]` | no |

### Sync tools
`familiar.tools.sync({ tools })`

Sync the tool set for the current token-backed integration. Returns `{ syncedTools, status }`.

### Get current integration config
`familiar.integration.get()`

Get the current integration configuration. Returns `Integration`.

### Update the AI provider key or base URL
`familiar.integration.update({ aiApiKey?, baseUrl? })`

Update the AI provider key or executor base URL. Pass `null` to clear a value. Returns `Integration`.

### Get integration status and account usage
`familiar.integration.status()`

Returns integration config plus account plan, action counts, and runtime stats (tool count, thread count).

### Simulate a turn
`familiar.simulate({ text, channel, userId?, threadId?, integrationId?, tools? })`

Preview what *familiar* would do without persisting anything. Returns `SimulateInputResult`.

### Stream a response
`familiar.inputStream({ text, channel, userId?, threadId?, integrationId?, tools? })`

Receive the assistant response as an async generator of SSE events. Yields `InputStreamEvent`.

### Check integration health
`familiar.tools.health()`

Returns integration health including tool counts, executor failure rates, and overall status.

### Get account details
`familiar.account.get()`

Returns account and token metadata for the current token.

### Get account usage
`familiar.account.usage()`

Returns plan, action count, and free tier usage.

### Read shared memory
`familiar.memory.getUserMemory({ userId? })`

Returns the shared memory string for a user. Defaults to `"default"`.

### Read thread memory
`familiar.memory.getThreadMemory({ threadId })`

Returns the thread-local memory string for a specific thread.

### List threads
`familiar.threads.list({ userId? })`

Returns a list of threads. Defaults to `"default"` user.

### Create a thread
`familiar.threads.create({ title?, isPrivate?, channel, userId?, integrationId? })`

Creates a new thread. Returns `{ threadId, title, isPrivate, status }`.

### Rename a thread
`familiar.threads.update({ threadId, title, userId?, integrationId? })`

Updates a thread's title.

### Delete a thread
`familiar.threads.delete({ threadId, userId?, integrationId? })`

Deletes a thread and its associated memory.

### Query audit events
`familiar.audit.events({ status?, event?, requestId?, limit? })`

Returns audit log events with optional filters.

## Types

```typescript
type Channel = {
  type: string;
  id: string;
  name?: string;
};

type Tool = {
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  inputMode?: "processed" | "raw";
  status?: "active" | "inactive";
};

type Message = {
  messageId: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

type InputResult = {
  threadId: string;
  integrationId?: string;
  messages: Message[];
  execution: {
    state: "completed" | "needs_clarification" | "accepted" | "in_progress" | "failed";
    executionId?: string;
  };
};

type SimulateInputResult = {
  threadId: string;
  integrationId?: string;
  simulated: true;
  response: {
    type: string;
    content: string;
    reasoning: string | null;
    task_status: string | null;
  };
  execution: {
    state: string | null;
    execution_id: string | null;
  } | null;
  model: string;
};

type Integration = {
  id: string;
  aiApiKeySet: boolean;
  aiApiKeyPrefix: string | null;
  baseUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type IntegrationStatus = {
  integration: Integration;
  account: {
    id: string;
    plan: "free" | "paid";
    actionCount: number;
    freeActionsUsed: number;
    freeActionsRemaining: number | null;
  };
  runtime: {
    toolCount: number;
    threadCount: number;
  };
};

type IntegrationHealth = {
  integration: { id: string; configured: boolean };
  executor: { base_url_configured: boolean; recent_failures: number };
  tools: { count: number; active: number };
  callbacks: { recent_activity: boolean; recent_count: number };
  delivery: { recent_failures: number };
  overall: "healthy" | "warning" | "degraded";
};

type Thread = {
  threadId: string;
  title: string;
  isPrivate: boolean;
  updatedAt: string;
};

type AuditEvent = {
  event: string;
  requestId?: string;
  status?: "ok" | "error";
  code?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
  at: string;
};
```