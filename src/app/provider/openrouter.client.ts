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

type OpenRouterStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
    finish_reason?: string | null;
  }>;
};

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
};

export const callOpenRouter = async ({
  apiKey,
  model,
  messages,
  siteUrl = "http://localhost:5173",
  siteName = "familiar",
  jsonMode = false,
  fetchImpl = fetch,
}: {
  apiKey: string;
  model: string;
  messages: OpenRouterMessage[];
  siteUrl?: string;
  siteName?: string;
  jsonMode?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<string | null> => {
  const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": siteUrl,
      "X-Title": siteName,
    },
    body: JSON.stringify({
      model,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages,
    }),
  });

  const payload = (await response.json()) as OpenRouterResponse;

  if (!response.ok) {
    throw new Error(
      payload.error?.message || "OpenRouter returned an unexpected error.",
    );
  }

  return payload.choices?.[0]?.message?.content?.trim() || null;
};

export async function* callOpenRouterStream({
  apiKey,
  model,
  messages,
  siteUrl = "http://localhost:5173",
  siteName = "familiar",
  fetchImpl = fetch,
}: {
  apiKey: string;
  model: string;
  messages: OpenRouterMessage[];
  siteUrl?: string;
  siteName?: string;
  fetchImpl?: typeof fetch;
}): AsyncGenerator<string, void, unknown> {
  const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": siteUrl,
      "X-Title": siteName,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages,
    }),
  });

  if (!response.ok) {
    let message = "OpenRouter returned an unexpected error.";
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      message = payload.error?.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          const chunk = JSON.parse(data) as OpenRouterStreamChunk;
          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === "string") {
            yield delta;
          }
        } catch {
          // ignore malformed SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
