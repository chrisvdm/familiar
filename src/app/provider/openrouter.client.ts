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

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
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
