import { request } from "./client.js";
import type {
  Channel,
  Tool,
  InputResult,
  SyncToolsResult,
  Integration,
  IntegrationStatus,
  CreateAccountResult,
  AccountUsage,
  ThreadListResult,
  ThreadCreateResult,
  ThreadDeleteResult,
} from "./types.js";

export { FamiliarError } from "./client.js";
export type {
  Channel,
  Tool,
  Message,
  InputResult,
  SyncToolsResult,
  Integration,
  IntegrationStatus,
  Account,
  Token,
  CreateAccountResult,
  AccountUsage,
  Thread,
  ThreadListResult,
  ThreadCreateResult,
  ThreadDeleteResult,
  FamiliarErrorCode,
} from "./types.js";

const DEFAULT_HOST = "https://familiar.chrsvdmrw.workers.dev";

export class Familiar {
  private token: string;
  private host: string;

  constructor({ token, host = DEFAULT_HOST }: { token: string; host?: string }) {
    this.token = token;
    this.host = host;
  }

  static async createAccount({ host = DEFAULT_HOST }: { host?: string } = {}): Promise<CreateAccountResult> {
    const payload = await request<{
      account: { id: string; created_at: string };
      token: { value: string; prefix: string; last_four: string; created_at: string };
    }>({ host, method: "POST", path: "/api/v1/accounts", body: {} });

    return {
      account: { id: payload.account.id, createdAt: payload.account.created_at },
      token: {
        value: payload.token.value,
        prefix: payload.token.prefix,
        lastFour: payload.token.last_four,
        createdAt: payload.token.created_at,
      },
    };
  }

  async input({
    text,
    channel,
    userId,
    threadId,
    integrationId,
    tools,
  }: {
    text: string;
    channel: Channel;
    userId?: string;
    threadId?: string;
    integrationId?: string;
    tools?: Tool[];
  }): Promise<InputResult> {
    const payload = await request<{
      thread_id: string;
      integration_id?: string;
      messages: Array<{ message_id: string; role: "user" | "assistant"; content: string; created_at?: string }>;
      execution: { state: string; execution_id?: string };
    }>({
      host: this.host,
      method: "POST",
      path: "/api/v1/input",
      token: this.token,
      body: {
        input: { kind: "text", text },
        channel,
        ...(userId ? { user_id: userId } : {}),
        ...(threadId ? { thread_id: threadId } : {}),
        ...(integrationId ? { integration_id: integrationId } : {}),
        ...(tools ? { tools: tools.map(serializeTool) } : {}),
      },
    });

    return {
      threadId: payload.thread_id,
      integrationId: payload.integration_id,
      messages: payload.messages.map((m) => ({
        messageId: m.message_id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
      })),
      execution: {
        state: payload.execution.state as InputResult["execution"]["state"],
        executionId: payload.execution.execution_id,
      },
    };
  }

  tools = {
    sync: async ({ tools }: { tools: Tool[] }): Promise<SyncToolsResult> => {
      const payload = await request<{
        integration_id?: string;
        synced_tools: number;
        status: string;
      }>({
        host: this.host,
        method: "POST",
        path: "/api/v1/tools/sync",
        token: this.token,
        body: { tools: tools.map(serializeTool) },
      });

      return {
        integrationId: payload.integration_id,
        syncedTools: payload.synced_tools,
        status: payload.status,
      };
    },
  };

  integration = {
    get: async (): Promise<Integration> => {
      const payload = await request<{ integration: Record<string, unknown> }>({
        host: this.host,
        method: "GET",
        path: "/api/v1/integration",
        token: this.token,
      });
      return deserializeIntegration(payload.integration);
    },

    update: async ({
      aiApiKey,
      baseUrl,
    }: {
      aiApiKey?: string | null;
      baseUrl?: string | null;
    }): Promise<Integration> => {
      const payload = await request<{ integration: Record<string, unknown> }>({
        host: this.host,
        method: "PATCH",
        path: "/api/v1/integration",
        token: this.token,
        body: {
          ...(aiApiKey !== undefined ? { ai_api_key: aiApiKey } : {}),
          ...(baseUrl !== undefined ? { base_url: baseUrl } : {}),
        },
      });
      return deserializeIntegration(payload.integration);
    },

    status: async (): Promise<IntegrationStatus> => {
      const payload = await request<{
        integration: Record<string, unknown>;
        account: {
          id: string;
          plan: "free" | "paid";
          action_count: number;
          free_actions_used: number;
          free_actions_remaining: number | null;
        };
        runtime: {
          tool_count: number;
          thread_count: number;
        };
      }>({
        host: this.host,
        method: "GET",
        path: "/api/v1/integration/status",
        token: this.token,
      });

      return {
        integration: deserializeIntegration(payload.integration),
        account: {
          id: payload.account.id,
          plan: payload.account.plan,
          actionCount: payload.account.action_count,
          freeActionsUsed: payload.account.free_actions_used,
          freeActionsRemaining: payload.account.free_actions_remaining,
        },
        runtime: {
          toolCount: payload.runtime.tool_count,
          threadCount: payload.runtime.thread_count,
        },
      };
    },
  };

  account = {
    usage: async (): Promise<AccountUsage> => {
      const payload = await request<{
        account_id: string;
        plan: "free" | "paid";
        action_count: number;
        free_actions_used: number;
        free_actions_remaining: number | null;
      }>({
        host: this.host,
        method: "GET",
        path: "/api/v1/account/usage",
        token: this.token,
      });

      return {
        accountId: payload.account_id,
        plan: payload.plan,
        actionCount: payload.action_count,
        freeActionsUsed: payload.free_actions_used,
        freeActionsRemaining: payload.free_actions_remaining,
      };
    },
  };

  threads = {
    list: async ({ userId }: { userId?: string } = {}): Promise<ThreadListResult> => {
      const path = userId
        ? `/api/v1/users/${encodeURIComponent(userId)}/threads`
        : "/api/v1/users/default/threads";

      const payload = await request<{
        threads: Array<{
          thread_id: string;
          title: string;
          is_private: boolean;
          updated_at: string;
        }>;
      }>({
        host: this.host,
        method: "GET",
        path,
        token: this.token,
      });

      return {
        threads: payload.threads.map((t) => ({
          threadId: t.thread_id,
          title: t.title,
          isPrivate: t.is_private,
          updatedAt: t.updated_at,
        })),
      };
    },

    create: async ({
      title,
      isPrivate,
      channel,
      userId,
      integrationId,
    }: {
      title?: string;
      isPrivate?: boolean;
      channel: Channel;
      userId?: string;
      integrationId?: string;
    }): Promise<ThreadCreateResult> => {
      const payload = await request<{
        thread_id: string;
        title: string;
        is_private: boolean;
        status: string;
      }>({
        host: this.host,
        method: "POST",
        path: "/api/v1/threads",
        token: this.token,
        body: {
          ...(title ? { title } : {}),
          ...(isPrivate !== undefined ? { is_private: isPrivate } : {}),
          channel,
          ...(userId ? { user_id: userId } : {}),
          ...(integrationId ? { integration_id: integrationId } : {}),
        },
      });

      return {
        threadId: payload.thread_id,
        title: payload.title,
        isPrivate: payload.is_private,
        status: payload.status,
      };
    },

    delete: async ({
      threadId,
      userId,
      integrationId,
    }: {
      threadId: string;
      userId?: string;
      integrationId?: string;
    }): Promise<ThreadDeleteResult> => {
      const payload = await request<{
        thread_id: string;
        status: string;
      }>({
        host: this.host,
        method: "DELETE",
        path: `/api/v1/threads/${encodeURIComponent(threadId)}`,
        token: this.token,
        body: {
          ...(userId ? { user_id: userId } : {}),
          ...(integrationId ? { integration_id: integrationId } : {}),
        },
      });

      return {
        threadId: payload.thread_id,
        status: payload.status,
      };
    },
  };
}

const serializeTool = (tool: Tool) => ({
  tool_name: tool.toolName,
  description: tool.description,
  input_schema: tool.inputSchema,
  ...(tool.inputMode ? { input_mode: tool.inputMode } : {}),
  ...(tool.status ? { status: tool.status } : {}),
});

const deserializeIntegration = (raw: Record<string, unknown>): Integration => ({
  id: raw.id as string,
  aiApiKeySet: raw.ai_api_key_set as boolean,
  aiApiKeyPrefix: raw.ai_api_key_prefix as string | null,
  baseUrl: raw.base_url as string | null,
  createdAt: raw.created_at as string,
  updatedAt: raw.updated_at as string,
});
