import type { ChatMessage } from "./shared";

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const DEFAULT_MODEL = "openai/gpt-4o-mini";
export const MAX_CONTEXT_MESSAGES = 6;

export const buildPromptContext = (messages: ChatMessage[]): OpenRouterMessage[] =>
  messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-MAX_CONTEXT_MESSAGES)
    .map(({ role, content }) => ({ role, content }));

export const resolveConversationTimeZone = (timeZone?: string | null) =>
  timeZone?.trim() || "UTC";

export const createDateTimeSystemPrompt = ({
  now = new Date(),
  timeZone,
}: {
  now?: Date;
  timeZone?: string | null;
}) => {
  const resolvedTimeZone = resolveConversationTimeZone(timeZone);
  const localDateTime = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: resolvedTimeZone,
    timeZoneName: "short",
  }).format(now);

  return [
    "Current date and time context",
    `- Local date and time: ${localDateTime}`,
    `- Time zone: ${resolvedTimeZone}`,
    `- ISO timestamp: ${now.toISOString()}`,
    "Use this when interpreting words like today, tomorrow, yesterday, now, this morning, or this evening.",
  ].join("\n");
};
