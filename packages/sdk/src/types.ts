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

export type IntegrationStatus = {
  integration: Integration;
  account: {
    id: string;
    plan: "free" | "paid";
    actionCount: number;
    freeActionsUsed: number;
    freeActionsRemaining: number | null;
  };
  runtime: {
    toolCount: number;
    threadCount: number;
  };
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

export type AccountUsage = {
  accountId: string;
  plan: "free" | "paid";
  actionCount: number;
  freeActionsUsed: number;
  freeActionsRemaining: number | null;
};

export type Thread = {
  threadId: string;
  title: string;
  isPrivate: boolean;
  updatedAt: string;
};

export type ThreadListResult = {
  threads: Thread[];
};

export type ThreadCreateResult = {
  threadId: string;
  title: string;
  isPrivate: boolean;
  status: string;
};

export type ThreadDeleteResult = {
  threadId: string;
  status: string;
};

export type AuditEvent = {
  event: string;
  requestId?: string;
  status?: "ok" | "error";
  code?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
  at: string;
};

export type AuditListResult = {
  events: AuditEvent[];
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
