const DEFAULT_BASE_URL = "http://localhost:5173";
const DEFAULT_WS_URL = "ws://localhost:5173";

export const getE2EBaseUrl = () =>
  process.env.FAMILIAR_E2E_BASE_URL?.trim() || DEFAULT_BASE_URL;

export const getE2EWebSocketUrl = () => {
  const base = process.env.FAMILIAR_E2E_BASE_URL?.trim() || DEFAULT_BASE_URL;
  return base.replace(/^http/, "ws");
};

export type E2EClient = {
  request: (path: string, init?: RequestInit) => Promise<Response>;
  createAccount: () => Promise<{
    token: string;
    accountId: string;
    integrationId: string;
  }>;
  setIntegrationConfig: (
    token: string,
    config: { base_url?: string; ai_api_key?: string; transport?: "webhook" | "websocket" },
  ) => Promise<Response>;
  syncTools: (
    token: string,
    tools: Array<{
      tool_name: string;
      description: string;
      input_schema: Record<string, unknown>;
    }>,
  ) => Promise<Response>;
  sendInput: (
    token: string,
    body: {
      input: { text: string };
      channel: { type: string; id: string };
    },
  ) => Promise<Response>;
  connectWebSocket: (token: string) => WebSocket;
};

export const createE2EClient = (): E2EClient => {
  const baseUrl = getE2EBaseUrl();
  const wsBaseUrl = getE2EWebSocketUrl();

  const request = async (path: string, init?: RequestInit): Promise<Response> => {
    const url = `${baseUrl}${path}`;
    const response = await fetch(url, init);
    return response;
  };

  const createAccount = async () => {
    const response = await request("/api/v1/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      throw new Error(`createAccount failed: ${response.status} ${await response.text()}`);
    }
    const data = (await response.json()) as {
      token: { value: string };
      account: { id: string };
      integration: { id: string };
    };
    return {
      token: data.token.value,
      accountId: data.account.id,
      integrationId: data.integration.id,
    };
  };

  const setIntegrationConfig = async (
    token: string,
    config: { base_url?: string; ai_api_key?: string; transport?: "webhook" | "websocket" },
  ) => {
    return request("/api/v1/integration", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config),
    });
  };

  const syncTools = async (
    token: string,
    tools: Array<{
      tool_name: string;
      description: string;
      input_schema: Record<string, unknown>;
    }>,
  ) => {
    return request("/api/v1/tools/sync", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tools }),
    });
  };

  const sendInput = async (
    token: string,
    body: {
      input: { text: string; append?: boolean; final?: boolean };
      channel: { type: string; id: string };
      thread_id?: string;
      model?: string;
    },
  ) => {
    return request("/api/v1/input", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...body,
        input: {
          kind: "text",
          ...body.input,
        },
      }),
    });
  };

  const connectWebSocket = (token: string) => {
    const ws = new WebSocket(`${wsBaseUrl}/ws/executor?token=${encodeURIComponent(token)}`);
    return ws;
  };

  return { request, createAccount, setIntegrationConfig, syncTools, sendInput, connectWebSocket };
};

export const waitForWebSocketMessage = (
  ws: WebSocket,
  timeoutMs = 15_000,
): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for WebSocket message`));
    }, timeoutMs);

    const onMessage = (event: MessageEvent) => {
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      try {
        resolve(JSON.parse(event.data as string));
      } catch {
        resolve(event.data);
      }
    };

    ws.addEventListener("message", onMessage);
  });
};
