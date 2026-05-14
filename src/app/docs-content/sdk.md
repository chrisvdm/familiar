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

type Integration = {
  id: string;
  aiApiKeySet: boolean;
  aiApiKeyPrefix: string | null;
  baseUrl: string | null;
  createdAt: string;
  updatedAt: string;
};
```