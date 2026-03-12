export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type ChatSessionState = {
  messages: ChatMessage[];
};

export const MAX_CONTEXT_MESSAGES = 6;

export const createAssistantMessage = (content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "assistant",
  content,
  createdAt: new Date().toISOString(),
});

export const createUserMessage = (content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "user",
  content,
  createdAt: new Date().toISOString(),
});

export const createInitialChatState = (): ChatSessionState => ({
  messages: [
    createAssistantMessage(
      "Ask for product strategy, copy rewrites, code help, or research summaries. I’ll answer through OpenRouter.",
    ),
  ],
});
