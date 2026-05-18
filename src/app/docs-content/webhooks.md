# Webhooks

When an executor cannot finish fast enough in the first response, it can return an accepted or in-progress state and send the final result later.

## Callback route

Use:

```text
POST /api/v1/webhooks/executor
```

## When to use it

Use this route when:

- the executor started the work successfully
- the user should get immediate feedback such as `Action started.`
- the final result will only be available later

## What the callback does

The callback tells *familiar*:

- which token-scoped setup the result belongs to
- which thread should receive it
- what final user-facing message should be appended

*familiar* then adds that result to the thread and delivers it through the normal channel path.

## Minimum payload

The only thing the executor must send back is the `execution_id`:

```json
{
  "result": {
    "execution_id": "exec_123",
    "state": "completed",
    "content": "Your import finished successfully."
  }
}
```

*familiar* resolves `thread_id`, `integration_id`, and `user_id` internally from the pending execution record. The executor does not need to track or store them.

### Example callback (minimal)

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

### Full payload (backward compatible)

Older executors can still send the full context explicitly:

```json
{
  "integration_id": "integration_a",
  "user_id": "user_123",
  "thread_id": "thread_abc",
  "result": {
    "execution_id": "exec_123",
    "state": "completed",
    "content": "Your import finished successfully."
  }
}
```

## Idempotency

If the executor retries the callback, send `Idempotency-Key`.

If no idempotency header is sent, *familiar* can fall back to `result.execution_id` when present.

## Sync and async together

The important model is:

- *familiar* triggers executor work
- the executor decides whether the work is blocking or async
- *familiar* turns either response into the user-facing conversation

*familiar* is not pretending to be a background job system. It is a tool router that can receive delayed executor results.
