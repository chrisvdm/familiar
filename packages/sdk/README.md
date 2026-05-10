# familiar-sdk

> **Early development.** This is an MVP release. Expect breaking changes.

JavaScript and TypeScript client for [familiar](https://familiar.chrsvdmrw.workers.dev) — a hosted tool router with memory.

## Install

```shell
npm install familiar-sdk
```

## Quick start

```typescript
import { Familiar } from "familiar-sdk";

const familiar = new Familiar({ token: "fam_your_token" });

const result = await familiar.input({
  text: "Start a countdown",
  channel: { type: "web", id: "session_123" },
});

console.log(result.messages.at(-1)?.content);
```

## Create an account

If you don't have a token yet:

```typescript
import { Familiar } from "familiar-sdk";

const { account, token } = await Familiar.createAccount();
console.log(token.value); // store this — shown once
```

## Set your AI provider key

Before familiar can process messages, each integration needs an OpenRouter key:

```typescript
await familiar.integration.update({
  aiApiKey: "sk-or-v1-your_openrouter_key",
});
```

Get a key at [openrouter.ai/keys](https://openrouter.ai/keys).

## Sync tools

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

## Error handling

All errors throw a `FamiliarError` with a `code` field:

```typescript
import { Familiar, FamiliarError } from "familiar-sdk";

try {
  await familiar.input({ text: "hello", channel: { type: "web", id: "s1" } });
} catch (err) {
  if (err instanceof FamiliarError) {
    console.log(err.code);    // e.g. "configuration_required"
    console.log(err.message); // human-readable explanation
    console.log(err.status);  // HTTP status code
  }
}
```

Common error codes:

- `unauthenticated` — missing or invalid token
- `configuration_required` — no AI provider key set on the integration
- `invalid_request` — bad request payload
- `rate_limited` — too many requests

## API

### `new Familiar({ token, host? })`

Create a client. `host` defaults to `https://familiar.chrsvdmrw.workers.dev`.

### `Familiar.createAccount({ host? })`

Create a new account. Returns `{ account, token }`. No token required.

### `familiar.input({ text, channel, userId?, threadId?, integrationId?, tools? })`

Send a conversation turn. Returns `{ threadId, messages, execution }`.

### `familiar.simulate({ text, channel, userId?, threadId?, integrationId?, tools? })`

Dry-run a conversation turn. Returns what familiar would do without persisting messages, executing tools, or consuming quota.

```typescript
const result = await familiar.simulate({
  text: "Update the sales sheet",
  channel: { type: "web", id: "session_123" },
});

console.log(result.response.type);     // "direct_reply" | "clarification" | "tool_call"
console.log(result.response.content);  // the planned response text or tool name
console.log(result.response.reasoning);// model reasoning
console.log(result.simulated);         // true
```

### `familiar.tools.sync({ tools })`

Sync the tool set for the current token-backed integration.

### `familiar.integration.get()`

Get the current integration configuration.

### `familiar.integration.update({ aiApiKey?, baseUrl? })`

Update the AI provider key or executor base URL. Pass `null` to clear a value.

### `familiar.integration.status()`

Get the full integration status: config, account usage, and runtime stats (tool count, thread count).

```typescript
const status = await familiar.integration.status();
console.log(status.account.plan);        // "free" | "paid"
console.log(status.account.actionCount);
console.log(status.runtime.toolCount);   // number of synced tools
console.log(status.runtime.threadCount); // number of threads
```

### `familiar.account.usage()`

Get current usage stats for the authenticated account.

```typescript
const usage = await familiar.account.usage();
console.log(usage.plan);                   // "free" | "paid"
console.log(usage.actionCount);            // total actions used
console.log(usage.freeActionsUsed);        // free tier actions consumed
console.log(usage.freeActionsRemaining);   // null if paid, number if free
```

### `familiar.threads.list({ userId? })`

List threads for the current integration. Optionally filter by `userId`.

```typescript
const { threads } = await familiar.threads.list();
// threads: [{ threadId, title, isPrivate, updatedAt }]
```

### `familiar.threads.create({ channel, title?, isPrivate?, userId?, integrationId? })`

Create a new thread.

```typescript
const thread = await familiar.threads.create({
  channel: { type: "web", id: "session_123" },
  title: "My thread",
});
console.log(thread.threadId);
```

### `familiar.threads.delete({ threadId, userId?, integrationId? })`

Delete a thread by ID.

```typescript
await familiar.threads.delete({ threadId: "thread_abc" });
```

### `familiar.audit.events({ status?, limit? })`

Query recent audit events for the current integration.

```typescript
const { events } = await familiar.audit.events({ limit: 20 });
// events: [{ event, requestId, status, code, detail, metadata, at }]

// Filter to errors only
const errors = await familiar.audit.events({ status: "error", limit: 10 });
```
