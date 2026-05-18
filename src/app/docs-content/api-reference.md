# API Reference

This page is the practical API reference for integrating with *familiar*.

## Authentication

Every inbound request to *familiar* should include:

```text
Authorization: Bearer <api-token>
Content-Type: application/json
```

Use `Idempotency-Key` on write operations that may be retried.

## Common response shape

Successful responses are JSON.

Errors should follow one simple shape:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid request payload.",
    "details": null
  }
}
```

## Create account

Endpoint:

```text
POST /api/v1/accounts
```

Create an account and immediately issue the first API token.

```json
{}
```

Example response:

```json
{
  "account": {
    "id": "acct_123",
    "created_at": "2026-03-25T10:00:00.000Z"
  },
  "token": {
    "value": "fam_abc123",
    "prefix": "fam_abcd",
    "last_four": "c123",
    "created_at": "2026-03-25T10:00:00.000Z"
  }
}
```

CLI equivalent:

```sh
npx familiar-cli init
```

## Get account

Endpoint:

```text
GET /api/v1/account
```

Resolve the account from the bearer token.

Example response:

```json
{
  "account": {
    "id": "acct_123",
    "created_at": "2026-03-25T10:00:00.000Z"
  },
  "setup": {
    "id": "setup_123",
    "base_url": "https://executor.example"
  },
  "token": {
    "id": "tok_123",
    "prefix": "fam_abcd",
    "last_four": "c123",
    "created_at": "2026-03-25T10:00:00.000Z",
    "last_used_at": "2026-03-25T10:05:00.000Z"
  }
}
```

## Get current integration

Endpoint:

```text
GET /api/v1/integration
```

Resolve the current token-backed integration configuration.

Example response:

```json
{
  "integration": {
    "id": "setup_123",
    "ai_api_key_set": true,
    "ai_api_key_prefix": "sk-or-v1",
    "base_url": "https://executor.example",
    "created_at": "2026-03-25T10:00:00.000Z",
    "updated_at": "2026-03-25T10:05:00.000Z"
  }
}
```

## Update current integration

Endpoint:

```text
PATCH /api/v1/integration
```

Update the AI provider key and/or executor base URL for the current token-backed integration.

**Set the AI provider key** — required before *familiar* will process messages:

```shell
curl -X PATCH https://familiar.monster/api/v1/integration \
  -H "Authorization: Bearer fam_your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "ai_api_key": "sk-or-v1-your_openrouter_key"
  }'
```

Only OpenRouter keys are accepted. The key must start with `sk-or-v1-`. The full key is never returned; responses include `ai_api_key_set` and `ai_api_key_prefix` only.

To clear a stored key, set `ai_api_key` to `null`. Omitting the field leaves the existing key unchanged.

**Set the executor base URL:**

```shell
curl -X PATCH https://familiar.monster/api/v1/integration \
  -H "Authorization: Bearer fam_your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "base_url": "https://vertex-amplifier-glasses-identical.trycloudflare.com"
  }'
```

Use the integration root URL here, not `/tools/execute`.
*familiar* appends `/tools/execute` when it calls the executor.

Example response:

```json
{
  "integration": {
    "id": "setup_123",
    "ai_api_key_set": true,
    "ai_api_key_prefix": "sk-or-v1",
    "base_url": "https://vertex-amplifier-glasses-identical.trycloudflare.com",
    "created_at": "2026-03-25T10:00:00.000Z",
    "updated_at": "2026-03-30T15:00:00.000Z"
  }
}
```

## Send input

Endpoint:

```text
POST /api/v1/input
```

Send one normalized message into *familiar*.

Use this when:

- a user sends a normal message
- you want *familiar* to continue a thread
- you want *familiar* to decide whether to reply, clarify, or run a tool

```json
{
  "thread_id": "thread_abc",
  "input": {
    "kind": "text",
    "text": "Update the client spreadsheet"
  },
  "channel": {
    "type": "web",
    "id": "browser_session_abc",
    "name": "Chris browser"
  },
  "tools": [
    {
      "tool_name": "calendar.create_event",
      "description": "Create a calendar event",
      "input_schema": {
        "type": "object",
        "properties": {
          "title": { "type": "string" },
          "date": { "type": "string" }
        },
        "required": ["title", "date"]
      },
      "status": "active"
    }
  ]
}
```

`tools` is optional.

Use it when:

- you are still developing and do not want a separate tool-push step yet
- you want to bootstrap the current account-backed setup from the same request

If `tools` is present, *familiar* stores those tools in the current token-backed setup and then uses them for routing.

If `tools` is omitted, *familiar* uses the tools already stored for the current token-backed setup.

Example response:

```json
{
  "integration_id": "integration_a",
  "thread_id": "thread_abc",
  "messages": [
    {
      "message_id": "msg_1",
      "role": "user",
      "content": "Update the client spreadsheet"
    },
    {
      "message_id": "msg_2",
      "role": "assistant",
      "content": "Which spreadsheet do you mean?"
    }
  ],
  "execution": {
    "state": "accepted",
    "execution_id": "exec_123"
  }
}
```

> [!NOTE]
> `input.text` is always normalized text. Voice or audio should be transcribed before calling this endpoint.

`integration_id` is optional on this endpoint in the current MVP happy path. The bearer token can identify the active setup.

## Sync tools

Endpoint:

```text
POST /api/v1/tools/sync
```

Tell *familiar* which tools the current token-backed setup should use.

Account creation already creates the current default setup behind the token. This endpoint configures that setup. It does not create a new one.

Use this when:

- a new integration is being set up
- a tool schema changes

```shell
curl -X POST https://familiar.monster/api/v1/tools/sync \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "tools": [
      {
        "tool_name": "spreadsheet.update_row",
        "description": "Update a spreadsheet row",
        "input_mode": "processed",
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

`input_mode` controls how *familiar* prepares tool arguments:

- `processed` is the default
- `raw` passes the captured user text through verbatim
- raw tools must define exactly one string field in `input_schema`

Compatibility routes still exist:

- `POST /api/v1/users/:user_id/tools/sync`
- `POST /api/v1/integrations/:integration_id/users/:user_id/tools/sync`

Example response:

```json
{
  "integration_id": "integration_a",
  "synced_tools": 1,
  "status": "ok"
}
```

The response still includes `integration_id` so callers can see which setup the token resolved to.

## Create a thread

Endpoint:

```text
POST /api/v1/threads
```

Create a new thread.

Use this when:

- you want to create a thread before the first message
- you want to separate a new task or theme from an older one
- you want to create a private thread

```json
{
  "title": "Q2 planning",
  "channel": {
    "type": "web",
    "id": "browser_session_abc"
  }
}
```

`channel` is required. *familiar* uses it to link the thread to the correct channel context.

To create a private thread, add `"is_private": true`:

```json
{
  "title": "Private planning",
  "channel": {
    "type": "web",
    "id": "browser_session_abc"
  },
  "is_private": true
}
```

Private threads keep their own local transcript and memory. They do not write into shared user memory and are not included in cross-thread recall.

Once created, pass the returned `thread_id` on subsequent input calls to continue the private thread.

## List threads

Endpoint:

```text
GET /api/v1/users/:user_id/threads
```

List threads for one user inside the setup identified by the token.

Use this when:

- showing a thread picker
- restoring previous conversations

## Rename a thread

Endpoint:

```text
PATCH /api/v1/threads
```

Update thread metadata.

Current use:

- rename a thread

```json
{
  "thread_id": "thread_abc",
  "title": "Client spreadsheet cleanup"
}
```

Compatibility route:

```text
PATCH /api/v1/threads/:thread_id
```

## Delete a thread

Endpoint:

```text
DELETE /api/v1/threads
```

Delete a thread.

Use this when:

- the user wants to remove an old conversation
- a thread was created by mistake

```json
{
  "thread_id": "thread_abc"
}
```

Compatibility route:

```text
DELETE /api/v1/threads/:thread_id
```

## Read shared memory

Endpoint:

```text
GET /api/v1/integrations/:integration_id/users/:user_id/memory
```

Read the shared memory for one integration and user.

Use this when:

- you want to inspect what *familiar* remembers across normal conversations

## Read thread memory

Endpoint:

```text
GET /api/v1/threads/:thread_id/memory
```

Read memory for one specific thread.

Use this when:

- you want to inspect thread-local context
- you are debugging how *familiar* is carrying a task forward

## Receive async executor results

Endpoint:

```text
POST /api/v1/webhooks/executor
```

Send a delayed executor result back into the conversation.

Use this when:

- the executor accepted work first
- the final result only becomes available later

### Minimal callback

The executor only needs to send `result.execution_id`. *familiar* resolves `thread_id`, `integration_id`, and `user_id` from the pending execution record:

```shell
curl -X POST https://familiar.monster/api/v1/webhooks/executor \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: exec_123" \
  -d '{
    "result": {
      "execution_id": "exec_123",
      "state": "completed",
      "content": "Your import finished successfully."
    }
  }'
```

### Full callback (backward compatible)

Executors can still send the full context explicitly. When `thread_id` is present, it is used directly and the pending execution lookup is skipped:

```shell
curl -X POST https://familiar.monster/api/v1/webhooks/executor \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: exec_123" \
  -d '{
    "integration_id": "integration_a",
    "user_id": "user_123",
    "thread_id": "thread_abc",
    "result": {
      "execution_id": "exec_123",
      "state": "completed",
      "content": "Your import finished successfully."
    }
  }'
```

> [!NOTE]
> If you retry the callback, send `Idempotency-Key`. If you do not send one, *familiar* can fall back to `result.execution_id` when present.

## Executor-side endpoints

These are not *familiar* endpoints. They are endpoints your integration exposes so *familiar* can talk to your system.

## Run a tool

Endpoint:

```text
POST {integration.baseUrl}/tools/execute
```

*familiar* calls this when it has already chosen a tool and prepared the arguments.

Use case:

- a user asks to update a spreadsheet row
- *familiar* chooses `spreadsheet.update_row`
- *familiar* sends structured arguments to your executor

Default payload:

```json
{
  "integration_id": "integration_a",
  "user_id": "user_123",
  "thread_id": "thread_abc",
  "tool_name": "spreadsheet.update_row",
  "arguments": {
    "sheet": "Sales Leads",
    "row_id": "42",
    "values": {
      "status": "contacted"
    }
  },
  "context": {
    "executor_result_webhook_url": "https://example.com/api/v1/webhooks/executor"
  }
}
```

> [!NOTE]
> This default body shape is not the only option. A tool can define `executor_payload` during tool sync, and *familiar* will send that rendered JSON body instead.

Example custom payload:

```json
{
  "operation": "spreadsheet.update_row",
  "params": {
    "sheet": "Sales Leads",
    "row_id": "42",
    "values": {
      "status": "contacted"
    }
  },
  "meta": {
    "user": "user_123",
    "thread": "thread_abc"
  }
}
```

## Deliver a channel message

Endpoint:

```text
POST {integration.baseUrl}/channels/messages
```

*familiar* calls this when it wants your integration to deliver a user-facing message back to the active channel.

Use case:

- an async executor result arrives
- *familiar* appends it to the thread
- *familiar* asks the integration to deliver that message to the right channel

Example payload:

```json
{
  "integration_id": "integration_a",
  "user_id": "user_123",
  "thread_id": "thread_abc",
  "channel": {
    "type": "whatsapp",
    "id": "+27731234567"
  },
  "message": {
    "kind": "text",
    "text": "Your import finished successfully."
  }
}
```

> [!NOTE]
> Channel delivery should target one concrete channel, not broadcast to all channels by default.

## Status codes

The main status codes you should expect are:

- `200` success
- `400` invalid payload
- `401` unauthenticated
- `403` integration mismatch or forbidden action
- `404` thread not found or not owned by the integration/user
- `409` idempotency conflict
- `429` rate limited

## Practical mental model

The API gets much easier to understand if you think of it like this:

1. Sync tools.
2. Send text into *familiar*.
3. Let *familiar* decide what should happen.
4. Let your executor do the work.
5. If needed, send the final result back later with the executor webhook.
