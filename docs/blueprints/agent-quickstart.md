# familiar Agent Quickstart

> Build with familiar as an AI agent.

## What This Is

This document is for AI agents that need to add conversational routing and memory to a project.

If you are an AI assistant building a backend, automation, or app for a human, familiar handles:

- conversation threads and continuity
- memory retrieval and storage
- tool selection and routing
- clarification flows

You handle the business logic (the actual tools).

## The 5-Minute Integration

### 1. Create an account

```typescript
const { account, token } = await Familiar.createAccount();
// Store token.value — shown once
```

This is a programmatic account creation. No email or password is required — the token itself is the credential. This is the right path for AI agents, automation, and non-interactive setups.

### 2. Set the AI provider key

```typescript
const familiar = new Familiar({ token: token.value });
await familiar.integration.update({
  aiApiKey: "sk-or-v1-your_openrouter_key",
});
```

### 3. Sync tools

```typescript
await familiar.tools.sync({
  tools: [
    {
      toolName: "tasks.create",
      description: "Create a new task",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          dueDate: { type: "string" },
        },
        required: ["title"],
      },
    },
    {
      toolName: "calendar.schedule",
      description: "Schedule a meeting",
      baseUrl: "https://calendar.example.com",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          startTime: { type: "string" },
        },
        required: ["title", "startTime"],
      },
    },
  ],
});
```

Or sync from a JSON file:

```typescript
import tools from "./familiar.json" assert { type: "json" };
await familiar.tools.sync({ tools });
```

Per-tool URL override:

- add `baseUrl` to any tool to route its execution to a different URL
- useful when tools live on different services or sub-domains
- if omitted, the integration's default base URL is used

### 4. Send input

```typescript
const result = await familiar.input({
  text: "Remind me to call the client tomorrow",
  channel: { type: "web", id: "session_123" },
});

// Check what familiar decided
if (result.execution.state === "completed") {
  console.log("Tool executed:", result.messages.at(-1)?.content);
} else if (result.execution.state === "needs_clarification") {
  console.log("Needs more info:", result.messages.at(-1)?.content);
}
```

### 5. Stream responses

```typescript
for await (const event of familiar.inputStream({
  text: "Tell me about my tasks",
  channel: { type: "web", id: "session_123" },
})) {
  if (event.event === "delta") {
    process.stdout.write(event.content);
  }
}
```

## Key Patterns for Agents

### Thread continuity

Always include `channel.type` and `channel.id`. familiar uses these to continue the right thread automatically.

```typescript
// Same channel = same thread continuity
const channel = { type: "slack", id: "user_123" };
```

### Tool execution

When familiar chooses a tool, it calls your executor. Return structured results:

```json
{
  "ok": true,
  "state": "completed",
  "result": {
    "summary": "Created task 'Call client'",
    "data": { "taskId": "task_123" }
  }
}
```

For async work, return `state: "accepted"` and call back later:

```typescript
// In your executor
await fetch("https://familiar.monster/api/v1/webhooks/executor", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    thread_id: "thread_abc",
    result: {
      state: "completed",
      content: "Your import finished successfully.",
    },
  }),
});
```

### Dry-run testing

Test routing without burning quota or polluting threads:

```typescript
const result = await familiar.simulate({
  text: "Update the sales sheet",
  channel: { type: "web", id: "test" },
});

console.log(result.response.type); // "direct_reply" | "clarification" | "tool_call"
```

### Health checks

Monitor integration health programmatically:

```typescript
const health = await familiar.integration.health();
if (health.overall !== "healthy") {
  console.warn("Integration issues:", health.executor.recent_failures, "failures");
}
```

## Common Gotchas

- **Normalized text only**: familiar only accepts `input.kind = "text"`. Transcribe voice notes upstream.
- **AI provider key required**: Set an OpenRouter key before processing messages. Free tier allows 10 actions without a key.
- **Thread ownership**: Threads are scoped to the authenticated integration. Don't share thread IDs across integrations.
- **Idempotency**: Use `Idempotency-Key` header for retries on write operations.

## API Surface at a Glance

| Operation | SDK Method | Endpoint |
|---|---|---|
| Create account | `Familiar.createAccount()` | `POST /api/v1/accounts` |
| Send input | `familiar.input()` | `POST /api/v1/input` |
| Stream input | `familiar.inputStream()` | `POST /api/v1/input/stream` |
| Simulate | `familiar.simulate()` | `POST /api/v1/input/simulate` |
| Sync tools | `familiar.tools.sync()` | `POST /api/v1/tools/sync` |
| Get health | `familiar.integration.health()` | `GET /api/v1/integration/health` |
| Get status | `familiar.integration.status()` | `GET /api/v1/integration/status` |
| List threads | `familiar.threads.list()` | `GET /api/v1/users/:userId/threads` |
| Get memory | `familiar.memory.getUserMemory()` | `GET /api/v1/users/:userId/memory` |
| Query audit | `familiar.audit.events()` | `GET /api/v1/audit/events` |
