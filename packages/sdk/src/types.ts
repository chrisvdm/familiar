export type Channel = {
  type: string;
  id: string;
  name?: string;
};

export type Tool = {
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  inputMode?: "processed" | "raw";
  status?: "active" | "inactive";
};

export type Message = {
  messageId: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

export type InputResult = {
  threadId: string;
  integrationId?: string;
  messages: Message[];
  execution: {
    state: "completed" | "needs_clarification" | "accepted" | "in_progress" | "failed";
    executionId?: string;
  };
};

export type SyncToolsResult = {
  integrationId?: string;
  syncedTools: number;
  status: string;
};

export type Integration = {
  id: string;
  aiApiKeySet: boolean;
  aiApiKeyPrefix: string | null;
  baseUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Account = {
  id: string;
  createdAt: string;
};

export type Token = {
  value: string;
  prefix: string;
  lastFour: string;
  createdAt: string;
};

export type CreateAccountResult = {
  account: Account;
  token: Token;
};

export type FamiliarErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "invalid_request"
  | "configuration_required"
  | "not_found"
  | "rate_limited"
  | "internal_error"
  | string;
