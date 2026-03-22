<img src="public/logo.png" width="325" align="right" />

# texty

_coming soon..._

Texty is a hosted conversation layer for executable systems.

People talk to Texty. Texty keeps track of threads, context, and memory. When work needs to happen, Texty hands it off to a connected executor and then explains the result back to the user.

## Features

- conversation threads managed by Texty
- shared memory across normal conversations
- private threads that stay out of shared memory
- channel-aware continuity across web, messaging, email, and other inputs
- tool and workflow handoff to connected executors
- clarification flow when a request is missing information

## Why It’s Useful

Without Texty, every app or script that wants a conversational interface has to rebuild the same things:

- conversation history
- thread handling
- memory
- clarification questions
- channel continuity
- user-facing replies

Texty is meant to own those parts once, so connected systems can focus on doing useful work.

## Current Status

Texty is currently an MVP in progress.

The core shape is there, but the product is still being hardened and simplified before it should be treated as a stable hosted service.

## Quick Start

The main endpoint is:

```text
POST /api/v1/input
```

## Flow

1. A user sends input to Texty.
2. Texty decides whether to answer directly, ask a follow-up, or call an executor.
3. If work needs to happen, Texty calls the executor.
4. Texty returns the result to the user in conversation.

Minimal flow:

1. Create an executor and get a token.
2. Sync the tools that executor exposes for a user.
3. Send user input to Texty.
4. Let Texty call the executor when work should happen.

There is a tiny reference executor here:

- [examples/minimal-executor/README.md](/Users/chris/Dev/texty/examples/minimal-executor/README.md)

## API Reference

### Sync tools

```shell
curl -X POST http://localhost:5173/api/v1/providers/provider_a/users/user_123/tools/sync \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "provider_a",
    "user_id": "user_123",
    "tools": [
      {
        "tool_name": "spreadsheet.update_row",
        "description": "Update a spreadsheet row",
        "input_schema": {
          "type": "object",
          "properties": {
            "sheet": { "type": "string" },
            "row_id": { "type": "string" },
            "values": { "type": "object" }
          },
          "required": ["sheet", "row_id", "values"]
        },
        "status": "active"
      }
    ]
  }'
```

### Send input

```shell
curl -X POST http://localhost:5173/api/v1/input \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "provider_a",
    "user_id": "user_123",
    "input": {
      "kind": "text",
      "text": "Update the sales sheet and mark Acme as contacted"
    },
    "channel": {
      "type": "email",
      "id": "chris@example.com"
    }
  }'
```

### List threads

```shell
curl http://localhost:5173/api/v1/providers/provider_a/users/user_123/threads \
  -H "Authorization: Bearer dev-token"
```

### Response behavior

- responses include `request_id` and `X-Request-Id`
- write routes support `Idempotency-Key`
- input is rate-limited per executor/user pair
- normal conversations are captured into memory by default
- private threads are excluded from shared-memory capture and retrieval

Execution states:

- `completed`
- `needs_clarification`
- `accepted`
- `in_progress`
- `failed`

## Scripts

- `npm run dev`
- `npm run check`
- `npm run build`
- `npm test`
