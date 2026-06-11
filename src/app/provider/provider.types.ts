import type {
  ChatThreadSummary,
  GlobalMemory,
} from "../chat/shared";

export type MemoryRetrievalMode =
  | "none"
  | "thread"
  | "provider_user"
  | "custom_scope"
  | "external";

export type MemoryPolicy = {
  mode: MemoryRetrievalMode;
  memoryScopeId?: string;
  externalContextSource?: string;
};

export type AllowedTool = {
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  inputMode?: "processed" | "raw";
  executorPayload?: unknown;
  policy: Record<string, unknown>;
  status: "active" | "disabled";
};

export type ChannelIdentity = {
  type: string;
  id: string;
  lastActiveThreadId: string | null;
  updatedAt: string;
};

export type PendingExecution = {
  executionId: string;
  threadId: string;
  toolName: string;
  createdAt: string;
};

export type ProviderUserContext = {
  providerId: string;
  userId: string;
  selectedModel: string;
  memoryPolicy: MemoryPolicy;
  globalMemory: GlobalMemory;
  threads: ChatThreadSummary[];
  allowedTools: AllowedTool[];
  channels: Record<string, ChannelIdentity>;
  threadChannels: Record<string, ProviderChannelInput>;
  requestLog: {
    conversationInputTimestamps: string[];
    toolSyncTimestamps: string[];
  };
  auditLog: Array<{
    event: string;
    requestId?: string;
    status?: "ok" | "error";
    code?: string;
    detail?: string;
    metadata?: Record<string, unknown>;
    at: string;
  }>;
  pendingExecutions: Record<string, PendingExecution>;
  idempotency: Record<
    string,
    {
      requestHash: string;
      status: number;
      body: Record<string, unknown>;
      createdAt: string;
    }
  >;
  lastSynthesis: string | null;
  nextSynthesis: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProviderConfig = {
  token: string;
  baseUrl?: string;
  aiApiKey?: string;
  toolUrls?: Record<string, string>;
  webhookSecret?: string;
  transport?: "webhook" | "websocket";
};

export type ProviderChannelInput = {
  type: string;
  id: string;
};

export type ProviderConversationInput = {
  integration_id?: string;
  user_id?: string;
  thread_id?: string;
  input: {
    kind: "text";
    text: string;
    append?: boolean;
    final?: boolean;
  };
  model?: string;
  timezone?: string;
  channel: ProviderChannelInput;
  context?: {
    external_memories?: string[];
  };
  tools?: Array<{
    tool_name: string;
    description: string;
    input_schema: Record<string, unknown>;
    input_mode?: "processed" | "raw";
    executor_payload?: unknown;
    policy?: Record<string, unknown>;
    status?: "active" | "disabled";
  }>;
};

export type ProviderExecutorResultInput = {
  integration_id?: string;
  user_id?: string;
  thread_id?: string;
  channel?: ProviderChannelInput;
  result: {
    execution_id?: string;
    tool_name?: string;
    state: ProviderExecutionState;
    content: string;
    data?: Record<string, unknown>;
  };
};

export type ProviderToolSyncInput = {
  integration_id?: string;
  user_id?: string;
  tools: Array<{
    tool_name: string;
    description: string;
    input_schema: Record<string, unknown>;
    input_mode?: "processed" | "raw";
    executor_payload?: unknown;
    policy?: Record<string, unknown>;
    status?: "active" | "disabled";
    base_url?: string;
  }>;
};

export type ProviderExecutionState =
  | "completed"
  | "needs_clarification"
  | "accepted"
  | "in_progress"
  | "failed";

export type ProviderConversationResponseKind =
  | "chat"
  | "follow_up"
  | "confirmation"
  | "task_result";

export type RawToolArgumentUpdate = {
  arguments?: Record<string, unknown>;
  follow_up?: string | null;
  followUp?: string | null;
};
