# Executors

An executor is the script, service, workflow, or built tool that *familiar* triggers to do the requested work.

In simple terms:

- *familiar* handles the conversation
- the executor does the thing

## What *familiar* owns

By the time *familiar* calls an executor, it has already handled:

- thread continuity
- memory lookup
- clarification
- tool selection
- argument extraction

## What *familiar* sends

By the time the executor receives a request:

- the tool has already been selected
- arguments should already be structured
- missing fields should already have been clarified

That means the executor does not need to repeat routing or conversational extraction.

## Payload shape

The executor payload does not need to be one rigid global format.

By default, *familiar* sends a wrapped payload with fields such as:

- `tool_name`
- `arguments`
- `thread_id`
- `context`

But an integration can also define a tool-level `executor_payload` template and have *familiar* send that custom JSON shape instead.

### Default execution request

```json
{
  "integration_id": "integration_a",
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

### Custom execution request

For a tool that defines `executor_payload`, *familiar* can instead send something like:

```json
{
  "operation": "spreadsheet.update_row",
  "params": {
    "sheet": "Sales Leads",
    "row_id": "42"
  },
  "meta": {
    "user": "current-token-user"
  }
}
```

That means the transport stays the same, but the body can match what the integration actually wants.

## Blocking or async

Executors decide whether a request is:

- blocking, where the final result comes back immediately
- async, where the executor accepts the work first and sends the final result later

## Executor endpoints

*familiar* currently calls two integration-owned endpoints:

```text
POST {integration.baseUrl}/tools/execute
POST {integration.baseUrl}/channels/messages
```

`/tools/execute` is where *familiar* asks the executor to do real work.

`/channels/messages` is where *familiar* asks the integration to deliver a user-facing message back to the active channel.

## Channel delivery

Channel delivery should target one concrete channel, not broadcast to all channels.

The normal rule is simple:

- send back to the linked channel for the active thread
- identify that channel by `channel.type` and `channel.id`

### Example executor responses

A blocking response can return the final result immediately.

An async response should return a short acknowledgment such as `Action started.` and then call *familiar* back later with the final result.

```json
{
  "ok": true,
  "state": "accepted",
  "result": {
    "summary": "Action started."
  }
}
```
