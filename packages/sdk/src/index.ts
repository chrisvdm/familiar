import { request, FamiliarError } from "./client.js";
import type {
  Channel,
  Tool,
  InputResult,
  SyncToolsResult,
  AddToolResult,
  Integration,
  IntegrationStatus,
  IntegrationHealth,
  CreateAccountResult,
  AccountUsage,
  ThreadListResult,
  ThreadCreateResult,
  ThreadDeleteResult,
  AuditListResult,
  SimulateInputResult,
  InputStreamEvent,
  FamiliarErrorCode,
} from "./types.js";

export { FamiliarError };
export type {
  Channel,
  Tool,
  Message,
  InputResult,
  SyncToolsResult,
  AddToolResult,
  Integration,
  IntegrationStatus,
  IntegrationHealth,
  Account,
  Token,
  CreateAccountResult,
  AccountUsage,
  Thread,
  ThreadListResult,
  ThreadCreateResult,
  ThreadDeleteResult,
  AuditEvent,
  AuditListResult,
  FamiliarErrorCode,
  InputStreamEvent,
} from "./types.js";

const DEFAULT_HOST = "https://familiar.monster";

export class Familiar {
  private token: string;
  private host: string;

  constructor({ token, host = DEFAULT_HOST }: { token: string; host?: string }) {
    this.token = token;
    this.host = host;
  }

  static async createAccount({
    host = DEFAULT_HOST,
    baseUrl,
    aiApiKey,
    tools,
  }: {
    host?: string;
    baseUrl?: string;
    aiApiKey?: string;
    tools?: Array<{
      toolName: string;
      description: string;
      inputSchema: Record<string, unknown>;
      inputMode?: "processed" | "raw";
      status?: "active" | "inactive";
      baseUrl?: string;
    }>;
  } = {}): Promise<CreateAccountResult> {
    const payload = await request<{
      account: { id: string; created_at: string };
      token: { value: string; prefix: string; last_four: string; created_at: string };
      integration: { id: string; base_url: string | null; ai_api_key_set: boolean; created_at: string };
      tools?: { synced: number; status: string };
    }>({
      host,
      method: "POST",
      path: "/api/v1/accounts",
      body: {
        ...(baseUrl ? { base_url: baseUrl } : {}),
        ...(aiApiKey ? { ai_api_key: aiApiKey } : {}),
        ...(tools ? { tools: tools.map((t) => ({
          tool_name: t.toolName,
          description: t.description,
          input_schema: t.inputSchema,
          ...(t.inputMode ? { input_mode: t.inputMode } : {}),
          ...(t.status ? { status: t.status } : {}),
          ...(t.baseUrl ? { base_url: t.baseUrl } : {}),
        })) } : {}),
      },
    });

    return {
      account: { id: payload.account.id, createdAt: payload.account.created_at },
      token: {
        value: payload.token.value,
        prefix: payload.token.prefix,
        lastFour: payload.token.last_four,
        createdAt: payload.token.created_at,
      },
      integration: {
        id: payload.integration.id,
        baseUrl: payload.integration.base_url,
        aiApiKeySet: payload.integration.ai_api_key_set,
        createdAt: payload.integration.created_at,
      },
      ...(payload.tools ? { tools: { synced: payload.tools.synced, status: payload.tools.status } } : {}),
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
    return this._input({ text, channel, userId, threadId, integrationId, tools, simulate: false }) as Promise<InputResult>;
  }

  async simulate({
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
  }): Promise<SimulateInputResult> {
    return this._input({ text, channel, userId, threadId, integrationId, tools, simulate: true }) as Promise<SimulateInputResult>;
  }

  async *inputStream({
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
  }): AsyncGenerator<InputStreamEvent> {
    const url = `${this.host.replace(/\/$/, "")}/api/v1/input/stream`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        input: { kind: "text", text },
        channel,
        ...(userId ? { user_id: userId } : {}),
        ...(threadId ? { thread_id: threadId } : {}),
        ...(integrationId ? { integration_id: integrationId } : {}),
        ...(tools ? { tools: tools.map(serializeTool) } : {}),
      }),
    });

    if (!response.ok) {
      let payload: Record<string, unknown> = {};
      try {
        payload = await response.json();
      } catch {
        // ignore
      }
      const error = payload?.error as { code?: string; message?: string } | undefined;
      throw new FamiliarError({
        code: (error?.code ?? "internal_error") as FamiliarErrorCode,
        message: error?.message ?? `Request failed: ${response.status}`,
        status: response.status,
      });
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
          try {
            const event = JSON.parse(data) as InputStreamEvent;
            yield event;
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async _input({
    text,
    channel,
    userId,
    threadId,
    integrationId,
    tools,
    simulate,
  }: {
    text: string;
    channel: Channel;
    userId?: string;
    threadId?: string;
    integrationId?: string;
    tools?: Tool[];
    simulate: boolean;
  }): Promise<InputResult | SimulateInputResult> {
    const payload = await request<any>({
      host: this.host,
      method: "POST",
      path: simulate ? "/api/v1/input/simulate" : "/api/v1/input",
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

    if (simulate) {
      return {
        threadId: payload.thread_id,
        integrationId: payload.integration_id,
        simulated: payload.simulated as true,
        response: {
          type: payload.response.type as string,
          content: payload.response.content as string,
          reasoning: payload.response.reasoning as string | null,
          task_status: payload.response.task_status as string | null,
        },
        execution: payload.execution
          ? {
              state: payload.execution.state as string | null,
              execution_id: payload.execution.execution_id as string | null,
            }
          : null,
        model: payload.model as string,
      };
    }

    return {
      threadId: payload.thread_id,
      integrationId: payload.integration_id,
      messages: payload.messages.map((m: { message_id: string; role: string; content: string; created_at?: string }) => ({
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
    add: async ({ tool }: { tool: Tool }): Promise<AddToolResult> => {
      const payload = await request<{
        integration_id?: string;
        tool_name: string;
        total_tools: number;
        status: string;
        updated: boolean;
      }>({
        host: this.host,
        method: "POST",
        path: "/api/v1/tools",
        token: this.token,
        body: { tool: serializeTool(tool) },
      });

      return {
        integrationId: payload.integration_id,
        toolName: payload.tool_name,
        totalTools: payload.total_tools,
        status: payload.status,
        updated: payload.updated,
      };
    },

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

    health: async (): Promise<IntegrationHealth> => {
      const payload = await request<{
        integration: { id: string; configured: boolean };
        executor: { base_url_configured: boolean; recent_failures: number };
        tools: { count: number; active: number };
        callbacks: { recent_activity: boolean; recent_count: number };
        delivery: { recent_failures: number };
        overall: "healthy" | "warning" | "degraded";
      }>({
        host: this.host,
        method: "GET",
        path: "/api/v1/integration/health",
        token: this.token,
      });

      return {
        integration: payload.integration,
        executor: payload.executor,
        tools: payload.tools,
        callbacks: payload.callbacks,
        delivery: payload.delivery,
        overall: payload.overall,
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
      transport,
    }: {
      aiApiKey?: string | null;
      baseUrl?: string | null;
      transport?: "webhook" | "websocket";
    }): Promise<Integration> => {
      const payload = await request<{ integration: Record<string, unknown> }>({
        host: this.host,
        method: "PATCH",
        path: "/api/v1/integration",
        token: this.token,
        body: {
          ...(aiApiKey !== undefined ? { ai_api_key: aiApiKey } : {}),
          ...(baseUrl !== undefined ? { base_url: baseUrl } : {}),
          ...(transport !== undefined ? { transport } : {}),
        },
      });
      return deserializeIntegration(payload.integration);
    },

    status: async (): Promise<IntegrationStatus> => {
      const payload = await request<{
        integration: Record<string, unknown>;
        account: {
          id: string;
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
        },
        runtime: {
          toolCount: payload.runtime.tool_count,
          threadCount: payload.runtime.thread_count,
        },
      };
    },
  };

  account = {
    get: async (): Promise<{ account: { id: string; createdAt: string }; token: { id: string; prefix: string; lastFour: string; createdAt: string; lastUsedAt?: string } }> => {
      const payload = await request<{
        account: { id: string; created_at: string };
        token: { id: string; prefix: string; last_four: string; created_at: string; last_used_at?: string };
      }>({
        host: this.host,
        method: "GET",
        path: "/api/v1/account",
        token: this.token,
      });

      return {
        account: {
          id: payload.account.id,
          createdAt: payload.account.created_at,
        },
        token: {
          id: payload.token.id,
          prefix: payload.token.prefix,
          lastFour: payload.token.last_four,
          createdAt: payload.token.created_at,
          lastUsedAt: payload.token.last_used_at,
        },
      };
    },

    usage: async (): Promise<AccountUsage> => {
      const payload = await request<{
        account_id: string;
        action_count: number;
        free_actions_remaining: number;
      }>({
        host: this.host,
        method: "GET",
        path: "/api/v1/account/usage",
        token: this.token,
      });

      return {
        accountId: payload.account_id,
        actionCount: payload.action_count,
        freeActionsRemaining: payload.free_actions_remaining,
      };
    },
  };

  audit = {
    events: async ({
      status,
      event,
      requestId: requestIdFilter,
      limit,
    }: {
      status?: "ok" | "error";
      event?: string;
      requestId?: string;
      limit?: number;
    } = {}): Promise<AuditListResult> => {
      const query = new URLSearchParams();
      if (status) query.set("status", status);
      if (event) query.set("event", event);
      if (requestIdFilter) query.set("request_id", requestIdFilter);
      if (limit) query.set("limit", String(limit));

      const payload = await request<{
        events: Array<{
          event: string;
          request_id?: string;
          status?: "ok" | "error";
          code?: string;
          detail?: string;
          metadata?: Record<string, unknown>;
          at: string;
        }>;
      }>({
        host: this.host,
        method: "GET",
        path: `/api/v1/audit/events?${query.toString()}`,
        token: this.token,
      });

      return {
        events: payload.events.map((e) => ({
          event: e.event,
          requestId: e.request_id,
          status: e.status,
          code: e.code,
          detail: e.detail,
          metadata: e.metadata,
          at: e.at,
        })),
      };
    },
  };

  memory = {
    getUserMemory: async ({ userId }: { userId?: string } = {}): Promise<{ memory: string }> => {
      const path = userId
        ? `/api/v1/users/${encodeURIComponent(userId)}/memory`
        : "/api/v1/users/default/memory";

      const payload = await request<{
        memory?: string;
      }>({
        host: this.host,
        method: "GET",
        path,
        token: this.token,
      });

      return { memory: payload.memory ?? "" };
    },

    getThreadMemory: async ({ threadId }: { threadId: string }): Promise<{ memory: string }> => {
      const payload = await request<{
        memory?: string;
      }>({
        host: this.host,
        method: "GET",
        path: `/api/v1/threads/${encodeURIComponent(threadId)}/memory`,
        token: this.token,
      });

      return { memory: payload.memory ?? "" };
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

    update: async ({
      threadId,
      title,
      userId,
      integrationId,
    }: {
      threadId: string;
      title: string;
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
        method: "PATCH",
        path: `/api/v1/threads/${encodeURIComponent(threadId)}`,
        token: this.token,
        body: {
          title,
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
  ...(tool.baseUrl ? { base_url: tool.baseUrl } : {}),
});

const deserializeIntegration = (raw: Record<string, unknown>): Integration => ({
  id: raw.id as string,
  aiApiKeySet: raw.ai_api_key_set as boolean,
  aiApiKeyPrefix: raw.ai_api_key_prefix as string | null,
  baseUrl: raw.base_url as string | null,
  transport: (raw.transport as "webhook" | "websocket") ?? "webhook",
  createdAt: raw.created_at as string,
  updatedAt: raw.updated_at as string,
});
