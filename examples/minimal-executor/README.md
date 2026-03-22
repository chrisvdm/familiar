# Minimal Executor

This is the smallest useful example of an executor that can connect to Texty.

It does one thing:

- exposes `POST /tools/execute`
- accepts one tool, `notes.echo`
- returns either a clarification or a completed result

## Files

- `server.mjs`
  - tiny local HTTP server using only Node built-ins
- `texty.json`
  - example manifest shape for this executor

## Run It

Start the example server:

```shell
TEXTY_EXECUTOR_TOKEN=dev-token node examples/minimal-executor/server.mjs
```

It listens on:

```text
http://localhost:8787
```

## Local Texty Config

Point local Texty at this executor:

```shell
TEXTY_PROVIDER_CONFIG='{"provider_a":{"token":"dev-token","baseUrl":"http://localhost:8787"}}'
```

## Sync The Tool

```shell
curl -X POST http://localhost:5173/api/v1/providers/provider_a/users/user_123/tools/sync \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "provider_a",
    "user_id": "user_123",
    "tools": [
      {
        "tool_name": "notes.echo",
        "description": "Return a note back to the user",
        "input_schema": {
          "type": "object",
          "properties": {
            "note": { "type": "string" }
          },
          "required": ["note"]
        },
        "status": "active"
      }
    ]
  }'
```

## Send Input

```shell
curl -X POST http://localhost:5173/api/v1/input \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "provider_a",
    "user_id": "user_123",
    "input": {
      "kind": "text",
      "text": "Save this note: buy dog food"
    },
    "channel": {
      "type": "web",
      "id": "local-browser"
    }
  }'
```

Texty should decide to call `notes.echo`, then the executor will reply with a completed result.
