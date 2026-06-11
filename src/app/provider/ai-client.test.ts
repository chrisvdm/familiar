import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultAiClient,
  AiProviderError,
} from "./ai-client.ts";

const VALID_KEY = "sk-or-v1-testkey1234567890";

const mockEnv = (overrides: Partial<import("./ai-client.ts").AiEnv> = {}) =>
  overrides;

test("route falls back to OpenRouter when Workers AI is disabled", async () => {
  const client = createDefaultAiClient(
    mockEnv({
      OPENROUTER_API_KEY: VALID_KEY,
      OPENROUTER_MODEL: "openai/gpt-4o-mini",
      TEXTY_USE_WORKERS_AI_ROUTING: "false",
    }),
  );

  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                '{"tool":"none","arguments":{},"reasoning":"test","confidence":0}',
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const result = await client.route({
      messages: [{ role: "user", content: "hello" }],
    });

    assert.equal(
      result,
      '{"tool":"none","arguments":{},"reasoning":"test","confidence":0}',
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("route falls back to OpenRouter when Workers AI binding is missing", async () => {
  const client = createDefaultAiClient(
    mockEnv({
      OPENROUTER_API_KEY: VALID_KEY,
      OPENROUTER_MODEL: "openai/gpt-4o-mini",
      TEXTY_USE_WORKERS_AI_ROUTING: "true",
      // AI binding intentionally missing
    }),
  );

  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                '{"tool":"todo.add","arguments":{"item":"x"},"reasoning":"test","confidence":0.9}',
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const result = await client.route({
      messages: [{ role: "user", content: "add todo" }],
    });

    assert.ok(result.includes("todo.add"));
  } finally {
    global.fetch = originalFetch;
  }
});

test("route uses Workers AI when enabled and binding available", async () => {
  let capturedModel: string | undefined;
  let capturedInputs: Record<string, unknown> | undefined;

  const client = createDefaultAiClient(
    mockEnv({
      OPENROUTER_API_KEY: VALID_KEY,
      OPENROUTER_MODEL: "openai/gpt-4o-mini",
      TEXTY_USE_WORKERS_AI_ROUTING: "true",
      CLOUDFLARE_ROUTING_MODEL: "@cf/test-model",
      AI: {
        run: async (model, inputs) => {
          capturedModel = model;
          capturedInputs = inputs;
          return {
            response:
              '{"tool":"todo.add","arguments":{"item":"x"},"reasoning":"test","confidence":0.9}',
          };
        },
      },
    }),
  );

  const result = await client.route({
    messages: [{ role: "user", content: "add todo" }],
  });

  assert.equal(capturedModel, "@cf/test-model");
  assert.ok(capturedInputs);
  assert.ok(result.includes("todo.add"));
});

test("missing api key throws AiProviderError with suggestion", async () => {
  const client = createDefaultAiClient(
    mockEnv({
      OPENROUTER_API_KEY: "",
      OPENROUTER_MODEL: "openai/gpt-4o-mini",
      TEXTY_USE_WORKERS_AI_ROUTING: "false",
    }),
  );

  await assert.rejects(
    async () =>
      client.route({
        messages: [{ role: "user", content: "hello" }],
      }),
    (err: unknown) => {
      assert.ok(err instanceof AiProviderError);
      const error = err as AiProviderError;
      assert.equal(error.code, "missing_api_key");
      assert.equal(error.stage, "routing");
      assert.equal(error.provider, "openrouter");
      assert.ok(error.suggestion.includes(".dev.vars"));
      return true;
    },
  );
});

test("placeholder api key throws AiProviderError", async () => {
  const client = createDefaultAiClient(
    mockEnv({
      OPENROUTER_API_KEY: "your_openrouter_key",
      OPENROUTER_MODEL: "openai/gpt-4o-mini",
      TEXTY_USE_WORKERS_AI_ROUTING: "false",
    }),
  );

  await assert.rejects(
    async () =>
      client.route({
        messages: [{ role: "user", content: "hello" }],
      }),
    (err: unknown) => {
      assert.ok(err instanceof AiProviderError);
      const error = err as AiProviderError;
      assert.equal(error.code, "missing_api_key");
      return true;
    },
  );
});

test("empty OpenRouter response throws AiProviderError", async () => {
  const client = createDefaultAiClient(
    mockEnv({
      OPENROUTER_API_KEY: VALID_KEY,
      OPENROUTER_MODEL: "openai/gpt-4o-mini",
      TEXTY_USE_WORKERS_AI_ROUTING: "false",
    }),
  );

  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: "" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    await assert.rejects(
      async () =>
        client.reply({
          messages: [{ role: "user", content: "hello" }],
        }),
      (err: unknown) => {
        assert.ok(err instanceof AiProviderError);
        const error = err as AiProviderError;
        assert.equal(error.code, "empty_response");
        assert.equal(error.stage, "reply");
        assert.ok(error.suggestion.includes("overloaded"));
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("OpenRouter http error throws AiProviderError", async () => {
  const client = createDefaultAiClient(
    mockEnv({
      OPENROUTER_API_KEY: VALID_KEY,
      OPENROUTER_MODEL: "openai/gpt-4o-mini",
      TEXTY_USE_WORKERS_AI_ROUTING: "false",
    }),
  );

  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({ error: { message: "Model not found" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );

  try {
    await assert.rejects(
      async () =>
        client.extract({
          messages: [{ role: "user", content: "hello" }],
        }),
      (err: unknown) => {
        assert.ok(err instanceof AiProviderError);
        const error = err as AiProviderError;
        assert.equal(error.code, "http_error");
        assert.equal(error.stage, "extraction");
        assert.ok(error.message.includes("Model not found"));
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("replyStream throws AiProviderError when key is missing", async () => {
  const client = createDefaultAiClient(
    mockEnv({
      OPENROUTER_API_KEY: "",
      OPENROUTER_MODEL: "openai/gpt-4o-mini",
    }),
  );

  await assert.rejects(
    async () => {
      const gen = client.replyStream({
        messages: [{ role: "user", content: "hello" }],
      });
      await gen.next();
    },
    (err: unknown) => {
      assert.ok(err instanceof AiProviderError);
      const error = err as AiProviderError;
      assert.equal(error.code, "missing_api_key");
      assert.equal(error.stage, "reply_stream");
      return true;
    },
  );
});

test("replyStream yields chunks on success", async () => {
  const client = createDefaultAiClient(
    mockEnv({
      OPENROUTER_API_KEY: VALID_KEY,
      OPENROUTER_MODEL: "openai/gpt-4o-mini",
    }),
  );

  const originalFetch = global.fetch;
  global.fetch = async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
          ),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  };

  try {
    const chunks: string[] = [];
    for await (const chunk of client.replyStream({
      messages: [{ role: "user", content: "hello" }],
    })) {
      chunks.push(chunk);
    }
    assert.deepEqual(chunks, ["Hello", " world"]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("extract uses Workers AI when available", async () => {
  let capturedModel: string | undefined;

  const client = createDefaultAiClient(
    mockEnv({
      OPENROUTER_API_KEY: VALID_KEY,
      OPENROUTER_MODEL: "openai/gpt-4o-mini",
      TEXTY_USE_WORKERS_AI_ROUTING: "true",
      CLOUDFLARE_EXTRACTION_MODEL: "@cf/extract-model",
      AI: {
        run: async (model) => {
          capturedModel = model;
          return {
            response: '{"arguments":{"item":"milk"},"follow_up":null}',
          };
        },
      },
    }),
  );

  const result = await client.extract({
    messages: [{ role: "user", content: "add milk" }],
  });

  assert.equal(capturedModel, "@cf/extract-model");
  assert.ok(result.includes("milk"));
});

test("AiProviderError carries all diagnostic fields", () => {
  const cause = new Error("underlying");
  const error = new AiProviderError({
    message: "Test error",
    code: "test_code",
    stage: "routing",
    provider: "openrouter",
    model: "gpt-4",
    suggestion: "Try again",
    cause,
  });

  assert.equal(error.message, "Test error");
  assert.equal(error.code, "test_code");
  assert.equal(error.stage, "routing");
  assert.equal(error.provider, "openrouter");
  assert.equal(error.model, "gpt-4");
  assert.equal(error.suggestion, "Try again");
  assert.equal(error.cause, cause);
  assert.equal(error.name, "AiProviderError");
});
