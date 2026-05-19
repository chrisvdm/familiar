import { env } from "cloudflare:workers";

import type { AccountEndpointDeps } from "./account.http-core";

const DEFAULT_MODEL = "openai/gpt-4o-mini";

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
};

const getResolvedModels = () => {
  const useWorkersAi = env.TEXTY_USE_WORKERS_AI_ROUTING?.trim().toLowerCase() === "true";

  const openRouterModel = env.OPENROUTER_MODEL?.trim() || null;
  const openRouterRouting =
    env.OPENROUTER_ROUTING_MODEL?.trim() ||
    env.OPENROUTER_DECISION_MODEL?.trim() ||
    env.OPENROUTER_ROUTER_MODEL?.trim() ||
    null;
  const openRouterExtraction =
    env.OPENROUTER_EXTRACTION_MODEL?.trim() || openRouterRouting || null;
  const openRouterMemory =
    env.OPENROUTER_MEMORY_MODEL?.trim() || openRouterModel || null;
  const openRouterMemorySelector =
    env.OPENROUTER_MEMORY_SELECTOR_MODEL?.trim() || openRouterMemory || null;

  const cfRouting =
    env.CLOUDFLARE_ROUTING_MODEL?.trim() ||
    env.CLOUDFLARE_DECISION_MODEL?.trim() ||
    null;
  const cfExtraction =
    env.CLOUDFLARE_EXTRACTION_MODEL?.trim() || cfRouting || null;

  if (useWorkersAi) {
    return {
      routing_mode: "workers_ai" as const,
      models: {
        reply: {
          value: openRouterModel || DEFAULT_MODEL,
          source: openRouterModel ? "OPENROUTER_MODEL" : "default",
        },
        routing: {
          value: cfRouting || "@cf/meta/llama-3.1-8b-instruct-fast",
          source: cfRouting ? "CLOUDFLARE_ROUTING_MODEL" : "default",
        },
        extraction: {
          value: cfExtraction || "@cf/qwen/qwen3-30b-a3b-fp8",
          source: cfExtraction ? "CLOUDFLARE_EXTRACTION_MODEL" : "default",
        },
        memory_selector: {
          value: openRouterMemorySelector || DEFAULT_MODEL,
          source: openRouterMemorySelector
            ? "OPENROUTER_MEMORY_SELECTOR_MODEL"
            : "default",
        },
        synthesis: {
          value: openRouterMemory || DEFAULT_MODEL,
          source: openRouterMemory ? "OPENROUTER_MEMORY_MODEL" : "default",
        },
      },
      env: {
        OPENROUTER_MODEL: openRouterModel,
        OPENROUTER_ROUTING_MODEL: env.OPENROUTER_ROUTING_MODEL?.trim() || null,
        OPENROUTER_EXTRACTION_MODEL:
          env.OPENROUTER_EXTRACTION_MODEL?.trim() || null,
        OPENROUTER_MEMORY_MODEL: openRouterMemory,
        OPENROUTER_MEMORY_SELECTOR_MODEL:
          env.OPENROUTER_MEMORY_SELECTOR_MODEL?.trim() || null,
        CLOUDFLARE_ROUTING_MODEL: cfRouting,
        CLOUDFLARE_EXTRACTION_MODEL:
          env.CLOUDFLARE_EXTRACTION_MODEL?.trim() || null,
        TEXTY_USE_WORKERS_AI_ROUTING:
          env.TEXTY_USE_WORKERS_AI_ROUTING?.trim() || null,
      },
    };
  }

  return {
    routing_mode: "openrouter" as const,
    models: {
      reply: {
        value: openRouterModel || DEFAULT_MODEL,
        source: openRouterModel ? "OPENROUTER_MODEL" : "default",
      },
      routing: {
        value: openRouterRouting || DEFAULT_MODEL,
        source: openRouterRouting ? "OPENROUTER_ROUTING_MODEL" : "default",
      },
      extraction: {
        value: openRouterExtraction || DEFAULT_MODEL,
        source: openRouterExtraction
          ? "OPENROUTER_EXTRACTION_MODEL"
          : "default",
      },
      memory_selector: {
        value: openRouterMemorySelector || DEFAULT_MODEL,
        source: openRouterMemorySelector
          ? "OPENROUTER_MEMORY_SELECTOR_MODEL"
          : "default",
      },
      synthesis: {
        value: openRouterMemory || DEFAULT_MODEL,
        source: openRouterMemory ? "OPENROUTER_MEMORY_MODEL" : "default",
      },
    },
    env: {
      OPENROUTER_MODEL: openRouterModel,
      OPENROUTER_ROUTING_MODEL: env.OPENROUTER_ROUTING_MODEL?.trim() || null,
      OPENROUTER_EXTRACTION_MODEL:
        env.OPENROUTER_EXTRACTION_MODEL?.trim() || null,
      OPENROUTER_MEMORY_MODEL: openRouterMemory,
      OPENROUTER_MEMORY_SELECTOR_MODEL:
        env.OPENROUTER_MEMORY_SELECTOR_MODEL?.trim() || null,
      TEXTY_USE_WORKERS_AI_ROUTING:
        env.TEXTY_USE_WORKERS_AI_ROUTING?.trim() || null,
    },
  };
};

export const createHandleGetModelsEndpoint = (deps: AccountEndpointDeps) => {
  return async ({ request }: { request: Request }) => {
    const requestId = deps.getRequestId(request);

    if (request.method !== "GET") {
      return deps.jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    const token = getBearerToken(request);

    if (!token) {
      return deps.jsonError({
        requestId,
        status: 401,
        code: "unauthenticated",
        message: "Missing bearer token.",
      });
    }

    const auth = await deps.authenticateAccountToken(token);

    if (!auth) {
      return deps.jsonError({
        requestId,
        status: 403,
        code: "forbidden",
        message: "Invalid API token.",
      });
    }

    const config = getResolvedModels();

    return deps.jsonResponse({
      requestId,
      body: {
        ok: true,
        ...config,
      },
    });
  };
};
