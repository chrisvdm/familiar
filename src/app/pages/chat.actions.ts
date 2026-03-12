"use server";

import { env } from "cloudflare:workers";
import { serverQuery } from "rwsdk/worker";

export type ChatMessageInput = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterMessage = {
  role: ChatMessageInput["role"];
  content: string;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const SYSTEM_PROMPT =
  "You are Texty, a concise product-minded AI assistant. Give direct, useful answers and avoid filler.";

export const generateReply = serverQuery(
  async (history: ChatMessageInput[]) => {
    const apiKey = env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY is not configured. Add it to .dev.vars for local development and as a Wrangler secret for deployment.",
      );
    }

    const sanitizedHistory = history
      .map(({ role, content }) => ({
        role,
        content: content.trim(),
      }))
      .filter((message) => message.content.length > 0)
      .slice(-12);

    if (sanitizedHistory.length === 0) {
      throw new Error("Please enter a message before sending.");
    }

    const messages: OpenRouterMessage[] = [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      ...sanitizedHistory,
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          env.OPENROUTER_SITE_URL || "http://localhost:5173",
        "X-Title": env.OPENROUTER_SITE_NAME || "Texty AI",
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL || DEFAULT_MODEL,
        messages,
      }),
    });

    const payload = (await response.json()) as OpenRouterResponse;

    if (!response.ok) {
      throw new Error(
        payload.error?.message || "OpenRouter returned an unexpected error.",
      );
    }

    const content = payload.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("OpenRouter did not return a response message.");
    }

    return {
      model: env.OPENROUTER_MODEL || DEFAULT_MODEL,
      content,
    };
  },
);
