import { createDateTimeSystemPrompt } from "../chat/conversation.runtime.ts";
import {
  callOpenRouter as callOpenRouterClient,
  callOpenRouterStream,
} from "./openrouter.client.ts";

const SYSTEM_PROMPT =
  "You are familiar, a concise conversational orchestration assistant. Return direct, useful replies without filler.";

export type AiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
};

export class AiProviderError extends Error {
  readonly code: string;
  readonly stage: string;
  readonly provider: string;
  readonly model: string;
  readonly suggestion: string;
  readonly cause?: Error;

  constructor(opts: {
    message: string;
    code: string;
    stage: string;
    provider: string;
    model: string;
    suggestion: string;
    cause?: Error;
  }) {
    super(opts.message);
    this.name = "AiProviderError";
    this.code = opts.code;
    this.stage = opts.stage;
    this.provider = opts.provider;
    this.model = opts.model;
    this.suggestion = opts.suggestion;
    this.cause = opts.cause;
  }
}

export type AiClient = {
  route: (input: {
    messages: AiMessage[];
    timeZone?: string | null;
    apiKey?: string;
  }) => Promise<string>;
  extract: (input: {
    messages: AiMessage[];
    timeZone?: string | null;
    apiKey?: string;
  }) => Promise<string>;
  reply: (input: {
    messages: AiMessage[];
    timeZone?: string | null;
    apiKey?: string;
  }) => Promise<string>;
  replyStream: (input: {
    messages: AiMessage[];
    timeZone?: string | null;
    apiKey?: string;
  }) => AsyncGenerator<string, void, unknown>;
};

const extractCloudflareAiText = (payload: unknown): string | null => {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const value = payload as {
    response?: unknown;
    result?: { response?: unknown };
  };
  if (typeof value.response === "string" && value.response.trim()) {
    return value.response;
  }
  if (
    value.result &&
    typeof value.result === "object" &&
    typeof value.result.response === "string" &&
    value.result.response.trim()
  ) {
    return value.result.response;
  }
  return null;
};

const buildSystemMessages = (timeZone?: string | null): AiMessage[] => [
  { role: "system", content: SYSTEM_PROMPT },
  { role: "system", content: createDateTimeSystemPrompt({ timeZone }) },
];

const wrapOpenRouterError = (opts: {
  error: unknown;
  stage: string;
  model: string;
}): AiProviderError => {
  const cause = opts.error instanceof Error ? opts.error : new Error(String(opts.error));

  if (cause.message.includes("OPENROUTER_API_KEY is not configured")) {
    return new AiProviderError({
      message: "OpenRouter API key is not configured.",
      code: "missing_api_key",
      stage: opts.stage,
      provider: "openrouter",
      model: opts.model,
      suggestion:
        "Set OPENROUTER_API_KEY in .dev.vars (copy from .dev.vars.example) or configure an integration key via PATCH /api/v1/integration.",
      cause,
    });
  }

  if (cause.message.includes("OpenRouter did not return")) {
    return new AiProviderError({
      message: `OpenRouter model ${opts.model} returned an empty response.`,
      code: "empty_response",
      stage: opts.stage,
      provider: "openrouter",
      model: opts.model,
      suggestion:
        "The model may be overloaded or temporarily unavailable. Try a different model via OPENROUTER_MODEL or enable TEXTY_USE_WORKERS_AI_ROUTING for Cloudflare fallback.",
      cause,
    });
  }

  return new AiProviderError({
    message: `OpenRouter returned an error for model ${opts.model}: ${cause.message}`,
    code: "http_error",
    stage: opts.stage,
    provider: "openrouter",
    model: opts.model,
    suggestion:
      "Check that your API key is valid and the model is available. Visit https://openrouter.ai/models to verify. Enable TEXTY_USE_WORKERS_AI_ROUTING for fallback.",
    cause,
  });
};

export type AiEnv = {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_SITE_URL?: string;
  OPENROUTER_SITE_NAME?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_ROUTING_MODEL?: string;
  OPENROUTER_EXTRACTION_MODEL?: string;
  TEXTY_USE_WORKERS_AI_ROUTING?: string;
  CLOUDFLARE_ROUTING_MODEL?: string;
  CLOUDFLARE_EXTRACTION_MODEL?: string;
  AI?: { run: (model: string, inputs: Record<string, unknown>) => Promise<unknown> };
};

export const createDefaultAiClient = (env: AiEnv = {} as AiEnv): AiClient => {
  const apiKey = env.OPENROUTER_API_KEY;
  const siteUrl = env.OPENROUTER_SITE_URL || "http://localhost:5173";
  const siteName = env.OPENROUTER_SITE_NAME || "familiar";

  const useWorkersAi = env.TEXTY_USE_WORKERS_AI_ROUTING?.trim().toLowerCase() === "true";
  const cfRoutingModel =
    env.CLOUDFLARE_ROUTING_MODEL?.trim() || "@cf/meta/llama-3.1-8b-instruct-fast";
  const cfExtractionModel = env.CLOUDFLARE_EXTRACTION_MODEL?.trim() || cfRoutingModel;
  const orRoutingModel =
    env.OPENROUTER_ROUTING_MODEL?.trim() || env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini";
  const orExtractionModel = env.OPENROUTER_EXTRACTION_MODEL?.trim() || orRoutingModel;
  const orReplyModel = env.OPENROUTER_MODEL?.trim() || orRoutingModel;

  const aiBinding = env.AI;

  const callOpenRouterComplete = async ({
    model,
    messages,
    jsonMode,
    timeZone,
    stage,
    apiKey: overrideKey,
  }: {
    model: string;
    messages: AiMessage[];
    jsonMode?: boolean;
    timeZone?: string | null;
    stage: string;
    apiKey?: string;
  }): Promise<string> => {
    try {
      const key = overrideKey || apiKey;
      if (!key || key === "your_openrouter_key") {
        throw new Error(
          "OPENROUTER_API_KEY is not configured. Add your real key to .dev.vars (copy from .dev.vars.example and replace 'your_openrouter_key').",
        );
      }

      const content = await callOpenRouterClient({
        apiKey: key,
        model,
        siteUrl,
        siteName,
        jsonMode,
        messages: [...buildSystemMessages(timeZone), ...messages],
      });

      if (!content) {
        throw new Error("OpenRouter did not return a response message.");
      }

      return content;
    } catch (error) {
      throw wrapOpenRouterError({ error, stage, model });
    }
  };

  return {
    route: async ({ messages, timeZone, apiKey: overrideKey }) => {
      if (useWorkersAi && aiBinding) {
        try {
          const payload = await aiBinding.run(cfRoutingModel, {
            messages: [...buildSystemMessages(timeZone), ...messages],
            response_format: {
              type: "json_schema",
              json_schema: {
                type: "object",
                properties: {
                  tool: { type: "string" },
                  arguments: { type: "object" },
                  reasoning: { type: "string" },
                  follow_up: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["tool", "arguments", "reasoning", "confidence"],
              },
            },
            max_tokens: 300,
            temperature: 0.1,
          });

          const content = extractCloudflareAiText(payload);
          if (content) {
            return content;
          }
        } catch (error) {
          const cause = error instanceof Error ? error : new Error(String(error));
          // biome-ignore lint/suspicious/noConsole: operational fallback warning
          console.warn(
            "Cloudflare AI routing model failed, falling back to OpenRouter.",
            cause.message,
          );
        }
      }

      return callOpenRouterComplete({
        model: orRoutingModel,
        messages,
        jsonMode: true,
        timeZone,
        stage: "routing",
        apiKey: overrideKey,
      });
    },

    extract: async ({ messages, timeZone, apiKey: overrideKey }) => {
      if (useWorkersAi && aiBinding) {
        try {
          const payload = await aiBinding.run(cfExtractionModel, {
            messages: [...buildSystemMessages(timeZone), ...messages],
            response_format: {
              type: "json_schema",
              json_schema: {
                type: "object",
                properties: {
                  arguments: { type: "object" },
                  follow_up: { type: "string" },
                },
                required: ["arguments"],
              },
            },
            max_tokens: 300,
            temperature: 0.1,
          });

          const content = extractCloudflareAiText(payload);
          if (content) {
            return content;
          }
        } catch (error) {
          const cause = error instanceof Error ? error : new Error(String(error));
          // biome-ignore lint/suspicious/noConsole: operational fallback warning
          console.warn(
            "Cloudflare AI extraction model failed, falling back to OpenRouter.",
            cause.message,
          );
        }
      }

      return callOpenRouterComplete({
        model: orExtractionModel,
        messages,
        jsonMode: true,
        timeZone,
        stage: "extraction",
        apiKey: overrideKey,
      });
    },

    reply: async ({ messages, timeZone, apiKey: overrideKey }) => {
      return callOpenRouterComplete({
        model: orReplyModel,
        messages,
        jsonMode: false,
        timeZone,
        stage: "reply",
        apiKey: overrideKey,
      });
    },

    replyStream: async function* ({ messages, timeZone, apiKey: overrideKey }) {
      const key = overrideKey || apiKey;
      if (!key || key === "your_openrouter_key") {
        throw new AiProviderError({
          message: "OpenRouter API key is not configured.",
          code: "missing_api_key",
          stage: "reply_stream",
          provider: "openrouter",
          model: orReplyModel,
          suggestion:
            "Set OPENROUTER_API_KEY in .dev.vars (copy from .dev.vars.example) or configure an integration key via PATCH /api/v1/integration.",
        });
      }

      try {
        yield* callOpenRouterStream({
          apiKey: key,
          model: orReplyModel,
          siteUrl,
          siteName,
          messages: [...buildSystemMessages(timeZone), ...messages],
        });
      } catch (error) {
        throw wrapOpenRouterError({
          error,
          stage: "reply_stream",
          model: orReplyModel,
        });
      }
    },
  };
};
