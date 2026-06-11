# Agent Quickstart

Set up familiar in a single API call and start routing text to your tools.

This guide is for AI agents and automated setups — no terminal, no browser, no CLI required.

## 1. Create an account with everything bundled

Instead of three separate calls (account → integration → tools), send everything at once:

```bash
curl -X POST https://familiar.monster/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "base_url": "https://my-executor.example.com",
    "ai_api_key": "sk-or-v1-your_openrouter_key",
    "tools": [
      {
        "tool_name": "hello.greet",
        "description": "Greet someone by name",
        "input_schema": {
          "type": "object",
          "properties": {
            "name": { "type": "string" }
          },
          "required": ["name"]
        }
      }
    ]
  }'
```

Response:

```json
{
  "account": { "id": "acct_...", "created_at": "..." },
  "token": {
    "value": "fam_...",
    "prefix": "fam_...",
    "last_four": "...",
    "created_at": "..."
  },
  "integration": {
    "id": "...",
    "base_url": "https://my-executor.example.com",
    "ai_api_key_set": true,
    "created_at": "..."
  },
  "tools": {
    "synced": 1,
    "status": "ok"
  }
}
```

Store `token.value` — it is shown once.

## 2. Send a message

```bash
curl -X POST https://familiar.monster/api/v1/input \
  -H "Authorization: Bearer fam_your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "input": { "kind": "text", "text": "Say hello to Alice" },
    "channel": { "type": "web", "id": "session_123" }
  }'
```

familiar will decide to call `hello.greet` with `{ "name": "Alice" }` and POST it to your executor.

## Using the SDK

```typescript
import { FamiliarClient } from "familiar-sdk";

const result = await FamiliarClient.createAccount({
  baseUrl: "https://my-executor.example.com",
  aiApiKey: "sk-or-v1-your_openrouter_key",
  tools: [
    {
      toolName: "hello.greet",
      description: "Greet someone by name",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      },
    },
  ],
});

const familiar = new FamiliarClient({ token: result.token.value });

const reply = await familiar.input({
  text: "Say hello to Alice",
  channel: { type: "web", id: "session_123" },
});
```

## Validate your tool manifest

Use the published JSON Schema to catch errors before syncing:

```json
{
  "$schema": "https://familiar.monster/schema/familiar.tools.schema.json",
  "tools": [
    {
      "tool_name": "hello.greet",
      "description": "Greet someone by name",
      "input_schema": {
        "type": "object",
        "properties": {
          "name": { "type": "string" }
        }
      }
    }
  ]
}
```

## Next steps

- [Executors](/docs/executors) — how to build the `POST /tools/execute` endpoint
- [Webhooks](/docs/webhooks) — how async callbacks work
- [API Reference](/docs/api-reference) — full endpoint documentation
