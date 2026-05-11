# Tool Target Quickstart

## Purpose

This document shows the smallest useful way to connect code to familiar.

Core terms:

- `account`
  - the owner that pays for and manages familiar
- `integration`
  - the configured familiar connection for one app, bot, or deployment
- `executor`
  - the script, service, or workflow runner familiar triggers to do real work
- `channel`
  - the communication surface the user is speaking through, identified by `channel.type` and `channel.id`

Current note:

- the public wire format uses `integration_id`
- familiar chooses the tool before it calls your code

That external system does not need to be a large product. It can be:

- a small script
- a lightweight service
- a workflow runner
- an AI-generated executable system

familiar handles the conversation. Your code handles the work.

## What You Need

To connect something to familiar in the current MVP, you need three things:

1. an API token
2. a URL familiar can call when work should run

That is enough for a first working setup.

Long term, explicit `integration_id` will matter again once one account can manage multiple setups.

## Step 1: Create an account and get a token

### Programmatic (curl, SDK, CLI)

```shell
curl -X POST https://familiar.chrsvdmrw.workers.dev/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{}'
```

This returns:

- `account.id`
- the first API token

That token is the main machine credential.

Or use the CLI:

```shell
familiar init
```

### Web setup

Visit `/setup` in a browser. Two options:

- **Quick start** — one click, no credentials. Creates an account + token immediately.
- **Register with email** — creates a password-protected account for easy dashboard login later.

After web registration, your API token is visible on the `/dashboard` page.

## Step 2: Set your AI provider key

familiar makes model calls on behalf of your integration. You must supply an OpenRouter API key so those calls are charged to your account, not the operator's.

```shell
curl -X PATCH https://familiar.chrsvdmrw.workers.dev/api/v1/integration \
  -H "Authorization: Bearer fam_your_token" \
  -H "Content-Type: application/json" \
  -d '{"ai_api_key": "sk-or-v1-..."}'
```

This returns the integration record with `ai_api_key_set: true` and the key prefix. The full key is never returned by any endpoint.

To clear a key later, send `{"ai_api_key": null}`.

Get an OpenRouter key at https://openrouter.ai/keys.

### Verify your setup

Check that everything is configured:

```shell
curl -s https://familiar.chrsvdmrw.workers.dev/api/v1/integration/status \
  -H "Authorization: Bearer fam_your_token"
```

This returns your integration config, account plan/usage, and runtime stats (tool count, thread count).

### Check integration health

```shell
curl -s https://familiar.chrsvdmrw.workers.dev/api/v1/integration/health \
  -H "Authorization: Bearer fam_your_token"
```

Returns:

- `overall` — `"healthy"`, `"warning"`, or `"degraded"`
- `executor.base_url_configured` — whether an executor URL is set
- `executor.recent_failures` — tool execution failures in the last 24h
- `tools.active` — number of active synced tools
- `callbacks.recent_activity` — whether async callbacks have been received
- `delivery.recent_failures` — delivery failures in the last 24h

## Step 3: Set your executor base URL

familiar needs a URL it can call when tools run. You have two options:

### Option A: Use `familiar portal` (local development)

Start a Cloudflare tunnel from your local machine:

```shell
familiar portal --port 8787
```

This creates a public URL, registers it with familiar automatically, and keeps it alive. Press `Ctrl-C` to stop — it clears the URL automatically.

Requires [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation).

### Option B: Set a deployed URL

If your executor is already deployed (e.g., on Vercel, Railway, or your own server), set the URL directly:

**CLI:**

```shell
familiar set-url https://my-app.vercel.app
```

**cURL:**

```shell
curl -X PATCH https://familiar.chrsvdmrw.workers.dev/api/v1/integration \
  -H "Authorization: Bearer fam_your_token" \
  -H "Content-Type: application/json" \
  -d '{"base_url": "https://my-app.vercel.app"}'
```

**SDK:**

```typescript
await familiar.integration.update({
  baseUrl: "https://my-app.vercel.app",
});
```

To clear the URL later, send `{"base_url": null}` or run `familiar set-url ""`.

## Step 4: Sync Allowed Tools

Tell familiar which tools the current setup should use.

```shell
curl -X POST https://familiar.chrsvdmrw.workers.dev/api/v1/tools/sync \
  -H "Authorization: Bearer fam_your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "tools": [
      {
        "tool_name": "spreadsheet.update_row",
        "description": "Update a row in a spreadsheet",
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

This gives familiar permission to reason over that tool for the current setup.

### Per-tool URL overrides

By default, all tool calls go to the integration's `base_url`. You can override this per-tool by adding `base_url` to individual tools during sync:

```json
{
  "tools": [
    {
      "tool_name": "spreadsheet.update_row",
      "description": "Update a row in a spreadsheet",
      "base_url": "https://sheets.example.com",
      "input_schema": { "type": "object" },
      "status": "active"
    },
    {
      "tool_name": "slack.send_message",
      "description": "Send a Slack message",
      "base_url": "https://slack-bot.example.com",
      "input_schema": { "type": "object" },
      "status": "active"
    }
  ]
}
```

This is useful when different tools live on different services or sub-domains. If `base_url` is omitted, the integration's default URL is used.

### Curl-only tool syncing

You can also send the tools array directly — no wrapper object needed. Save your tools to a file:

```json
// familiar.json
[
  {
    "tool_name": "spreadsheet.update_row",
    "description": "Update a row in a spreadsheet",
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
```

Then sync with:

```shell
curl -X POST https://familiar.chrsvdmrw.workers.dev/api/v1/tools/sync \
  -H "Authorization: Bearer fam_your_token" \
  -H "Content-Type: application/json" \
  -d @familiar.json
```

Current MVP shortcut:

- you can also send `tools` directly on `POST /api/v1/input`
- that is useful while setup/admin flows are still evolving

## Step 5: Send Conversation Input

Send a normal message into familiar.

```shell
curl -X POST https://familiar.chrsvdmrw.workers.dev/api/v1/input \
  -H "Authorization: Bearer fam_your_token" \
  -H "Content-Type: application/json" \
  -d '{
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

familiar will then:

1. load the thread and memory context
2. decide whether to answer directly, ask a follow-up, or call a tool
3. store the turn
4. return the updated result

Important input rule:

- familiar only receives normalized text here
- if your product supports voice notes or speech input, transcribe or otherwise normalize that upstream before calling `/api/v1/input`
- large transcription blocks are fine as long as they arrive as plain `input.text`

### Streaming responses

For direct replies, you can stream the assistant response as it is generated:

```shell
curl -N -X POST https://familiar.chrsvdmrw.workers.dev/api/v1/input/stream \
  -H "Authorization: Bearer fam_your_token" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "input": {
      "kind": "text",
      "text": "Tell me about the sales sheet"
    },
    "channel": {
      "type": "email",
      "id": "chris@example.com"
    }
  }'
```

SSE events:

```
data: {"event":"decision","action":"direct_reply"}

data: {"event":"delta","content":"The"}

data: {"event":"delta","content":" sales"}

data: {"event":"delta","content":" sheet"}

data: {"event":"done","thread_id":"thread_abc","messages":[...],"action":"direct_reply"}
```

Tool calls and clarifications are not streamed — they emit a single `decision` event followed by `done`.

## Step 6: Simulate input (dry run)

Test what familiar would do without persisting messages, executing tools, or burning quota:

```shell
curl -X POST https://familiar.chrsvdmrw.workers.dev/api/v1/input/simulate \
  -H "Authorization: Bearer fam_your_token" \
  -H "Content-Type: application/json" \
  -d '{
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

Response:

```json
{
  "integration_id": "setup_123",
  "user_id": "user_123",
  "thread_id": "thread_abc",
  "simulated": true,
  "response": {
    "type": "tool_call",
    "content": "spreadsheet.update_row",
    "reasoning": "The user wants to update a row in the sales sheet.",
    "task_status": "accepted"
  },
  "execution": {
    "state": "accepted",
    "execution_id": null
  },
  "model": "openai/gpt-4o-mini"
}
```

What simulate does:

- loads thread and memory context
- runs the decision model to classify intent and choose a tool
- returns the planned response, reasoning, and execution state

What simulate does **not** do:

- persist messages to the thread
- trigger tool execution
- increment action count or consume free quota
- schedule background memory refresh

Use this to test new tools, debug routing, or preview behavior before going live.

## Step 7: Expose `/tools/execute`

If familiar decides that a tool should run, it will call:

```text
POST {target_url}
```

Example request sent by familiar:

```json
{
  "sheet": "Sales",
  "row_id": "42",
  "values": {
    "status": "contacted"
  }
}
```

Your system should execute the work and return a structured result.

Important:

- familiar has already chosen the tool
- your target does not need to decide which tool to run again
- ideally, the request body is only the tool arguments
- the current runtime still includes extra wrapper fields in the payload today
- the simplest target just accepts the arguments and performs the action
- shortcut-forced tool mode may also include `context.raw_input_text`
- async executors may receive `context.executor_result_webhook_url` and can call it later when work finishes

### Step 8: Send an async result back to familiar

If your executor launches work and returns `accepted` or `in_progress`, keep the first response short and user-facing, for example:

```json
{
  "ok": true,
  "state": "accepted",
  "result": {
    "summary": "Action started."
  }
}
```

familiar will return that execution state in the conversation response and, when available, include:

- `execution.state`
- `execution.execution_id`

When the task actually finishes, call familiar back:

```shell
curl -X POST https://familiar.chrsvdmrw.workers.dev/api/v1/webhooks/executor \
  -H "Authorization: Bearer fam_your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "thread_id": "thread_abc",
    "result": {
      "execution_id": "exec_123",
      "state": "completed",
      "content": "Your import finished successfully."
    }
  }'
```

Keep this payload minimal unless you need more tracing:

- `thread_id`
- `result.execution_id` when you have one
- `result.state`
- `result.content`

Retry note:

- if you send `Idempotency-Key`, familiar will use it for replay protection
- if you do not send one, familiar falls back to `result.execution_id` when present

That is enough for familiar to append the async executor result into the thread and notify the user through its normal conversation flow.

Example successful response:

```json
{
  "ok": true,
  "state": "completed",
  "result": {
    "summary": "Updated row 42 in Sales.",
    "data": {
      "sheet": "Sales",
      "row_id": "42"
    }
  }
}
```

Example clarification response:

```json
{
  "ok": true,
  "state": "needs_clarification",
  "result": {
    "summary": "I need to know which sheet to update."
  }
}
```

Example failure response:

```json
{
  "ok": false,
  "state": "failed",
  "error": {
    "code": "sheet_not_found",
    "message": "No sheet named Sales exists."
  }
}
```

## Thread Management

### List threads

```shell
curl -s https://familiar.chrsvdmrw.workers.dev/api/v1/users/default/threads \
  -H "Authorization: Bearer fam_your_token"
```

Returns:

```json
{
  "threads": [
    {
      "thread_id": "thread_abc",
      "title": "Sales update",
      "is_private": false,
      "updated_at": "2026-05-08T10:00:00.000Z"
    }
  ]
}
```

### Create a thread

```shell
curl -X POST https://familiar.chrsvdmrw.workers.dev/api/v1/threads \
  -H "Authorization: Bearer fam_your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": { "type": "web", "id": "session_123" },
    "title": "My new thread"
  }'
```

### Delete a thread

```shell
curl -X DELETE https://familiar.chrsvdmrw.workers.dev/api/v1/threads/thread_abc \
  -H "Authorization: Bearer fam_your_token" \
  -H "Content-Type: application/json"
```

### Query memory

Shared memory (per integration user):

```shell
curl -s https://familiar.chrsvdmrw.workers.dev/api/v1/users/default/memory \
  -H "Authorization: Bearer fam_your_token"
```

Thread-local memory:

```shell
curl -s "https://familiar.chrsvdmrw.workers.dev/api/v1/threads/thread_abc/memory?user_id=default" \
  -H "Authorization: Bearer fam_your_token"
```

### Query audit events

```shell
curl -s "https://familiar.chrsvdmrw.workers.dev/api/v1/audit/events?limit=20" \
  -H "Authorization: Bearer fam_your_token"
```

Filter by status:

```shell
curl -s "https://familiar.chrsvdmrw.workers.dev/api/v1/audit/events?status=error&limit=10" \
  -H "Authorization: Bearer fam_your_token"
```

## The Minimum Mental Model

If you are connecting something simple, think of it like this:

- familiar listens to the user
- familiar decides what the user wants
- familiar picks the tool
- familiar calls your code when work should happen
- your code performs the action
- familiar explains the result back to the user

## Channel Identity

Every request should include:

- `integration_id`
- `user_id`
- `channel.type`
- `channel.id`

This matters because familiar uses channel context to maintain recent thread continuity.

Optional channel metadata:

- `channel.name`
  - a descriptive label for admin or UI use
  - not required for routing or identity

Example:

- `channel.type = "email"`
- `channel.id = "chris@example.com"`

or

- `channel.type = "web"`
- `channel.id = "browser_session_abc"`

## Private Threads

Normal conversations are captured into memory by default.

Private threads are the exception.

If you create a private thread:

- it should not contribute to shared memory
- it should not retrieve shared memory

## Useful Local Routes

For local development, these built-in routes are useful:

- `/sandbox/provider`
  - browser UI for exercising the current API
- `/sandbox/mock-provider/tools/execute`
  - local mock tool execution endpoint

## What This Gives You

Once connected, your system does not need to build:

- conversation threads
- memory handling
- clarification flow
- channel continuity
- user-facing replies

familiar handles those parts. Your system only needs to expose useful work at a URL familiar can trigger.
