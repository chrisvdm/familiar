import { request } from "./client.js";
import type {
  Channel,
  Tool,
  InputResult,
  SyncToolsResult,
  Integration,
  CreateAccountResult,
} from "./types.js";

export { FamiliarError } from "./client.js";
export type {
  Channel,
  Tool,
  Message,
  InputResult,
  SyncToolsResult,
  Integration,
  Account,
  Token,
  CreateAccountResult,
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
