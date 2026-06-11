# Executor Retry on Connection Failure

## Summary

Added exponential backoff retry for executor tool requests that fail due to connection errors (agent offline, network unreachable, tunnel down). This makes familiar more resilient when routing to local executors that may be temporarily unreachable — e.g., during a MachineN VM handoff or when a laptop with `familiar portal` is closed.

## Problem

When the executor was unreachable (tunnel dropped, VM moving between hosts, laptop off), familiar immediately returned `failed` with a generic "The executor could not be reached." message. This gave users no indication whether the failure was temporary or permanent.

## Solution

Modified `executeProviderToolRequest` in `src/app/provider/provider.execution.ts`:

- **Retry on connection errors**: Up to 3 retries with exponential backoff (1s, 2s, 4s delays)
- **Do not retry timeouts**: If the server is reachable but slow (15s timeout), fail immediately
- **Do not retry HTTP errors**: If the server returns 4xx/5xx, fail immediately — the server is alive
- **Better offline message**: After retries are exhausted, returns: "Your local agent is currently offline. The request will be delivered when it reconnects."

## New Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxRetries` | 3 | Number of retry attempts after initial failure |
| `retryDelayMs` | 1000 | Base delay in ms; actual delay is `baseDelay * 2^(attempt-1)` |

## Tests

4 new tests in `src/app/provider/provider.execution.test.ts`:
1. Retries connection errors and returns offline message after exhaustion
2. Succeeds on a later retry attempt
3. Does not retry timeouts
4. Does not retry HTTP errors

## Risks

- Slightly increased latency for genuinely offline executors (~7s total delay with 3 retries)
- Execution ID is generated once and reused across all retry attempts, so if the agent eventually receives the request, the execution_id is consistent
