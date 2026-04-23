// worklog: docs/worklogs/2026-04-23-ai-provider-key-onboarding.md
import assert from "node:assert/strict";
import test from "node:test";

import { callOpenRouter } from "./openrouter.client.ts";

const makeOkResponse = (content: string) =>
  new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  ) as Response;

const makeErrorResponse = (message: string) =>
  new Response(
    JSON.stringify({ error: { message } }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  ) as Response;

test("callOpenRouter uses aiApiKey in Authorization header", async () => {
  let capturedAuth: string | null = null;

  const result = await callOpenRouter({
    apiKey: "sk-or-v1-per-integration-key",
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hello" }],
    fetchImpl: async (_url, init) => {
      capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? null;
      return makeOkResponse("hi there");
    },
  });

  assert.equal(result, "hi there");
  assert.equal(capturedAuth, "Bearer sk-or-v1-per-integration-key");
});

test("callOpenRouter uses fallback env key when no aiApiKey provided", async () => {
  let capturedAuth: string | null = null;

  await callOpenRouter({
    apiKey: "sk-or-v1-env-fallback-key",
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hello" }],
    fetchImpl: async (_url, init) => {
      capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? null;
      return makeOkResponse("ok");
    },
  });

  assert.equal(capturedAuth, "Bearer sk-or-v1-env-fallback-key");
});

test("callOpenRouter throws on non-ok response", async () => {
  await assert.rejects(
    () =>
      callOpenRouter({
        apiKey: "sk-or-v1-key",
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hello" }],
        fetchImpl: async () => makeErrorResponse("Invalid API key."),
      }),
    /Invalid API key\./,
  );
});

test("callOpenRouter returns null for empty content", async () => {
  const result = await callOpenRouter({
    apiKey: "sk-or-v1-key",
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hello" }],
    fetchImpl: async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ) as Response,
  });

  assert.equal(result, null);
});

test("callOpenRouter sends json_object response_format when jsonMode is true", async () => {
  let capturedBody: Record<string, unknown> | null = null;

  await callOpenRouter({
    apiKey: "sk-or-v1-key",
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hello" }],
    jsonMode: true,
    fetchImpl: async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return makeOkResponse("{}");
    },
  });

  assert.deepEqual(capturedBody?.response_format, { type: "json_object" });
});
