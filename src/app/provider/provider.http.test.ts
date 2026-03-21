import assert from "node:assert/strict";
import test from "node:test";

import {
  getIdempotencyHeader,
  getRequestId,
  jsonError,
  jsonResponse,
  replayIdempotentResponse,
} from "./provider.http.ts";

test("getRequestId prefers the incoming request id header", () => {
  const request = new Request("https://example.com", {
    headers: {
      "X-Request-Id": "req_123",
    },
  });

  assert.equal(getRequestId(request), "req_123");
});

test("getIdempotencyHeader returns a trimmed idempotency key", () => {
  const request = new Request("https://example.com", {
    headers: {
      "Idempotency-Key": "  key-123  ",
    },
  });

  assert.equal(getIdempotencyHeader(request), "key-123");
});

test("jsonResponse includes request tracing headers and body", async () => {
  const response = jsonResponse({
    requestId: "req_123",
    body: {
      ok: true,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Request-Id"), "req_123");
  assert.equal(response.headers.get("Retry-After"), null);
  assert.deepEqual(await response.json(), {
    ok: true,
    request_id: "req_123",
  });
});

test("replayIdempotentResponse marks the response as a replay", async () => {
  const response = replayIdempotentResponse({
    requestId: "req_123",
    replay: {
      status: 202,
      body: {
        state: "accepted",
      },
    },
  });

  assert.equal(response.status, 202);
  assert.equal(response.headers.get("X-Request-Id"), "req_123");
  assert.equal(response.headers.get("X-Idempotent-Replay"), "true");
  assert.deepEqual(await response.json(), {
    state: "accepted",
    request_id: "req_123",
  });
});

test("jsonError preserves retry metadata for rate-limited responses", async () => {
  const response = jsonError({
    requestId: "req_123",
    status: 429,
    code: "rate_limited",
    message: "Too many conversation requests. Try again shortly.",
    details: {
      retry_after_seconds: 42,
    },
    retryAfterSeconds: 42,
  });

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("X-Request-Id"), "req_123");
  assert.equal(response.headers.get("Retry-After"), "42");
  assert.deepEqual(await response.json(), {
    error: {
      code: "rate_limited",
      message: "Too many conversation requests. Try again shortly.",
      details: {
        retry_after_seconds: 42,
      },
    },
    request_id: "req_123",
  });
});
