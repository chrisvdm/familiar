import { DurableObject } from "cloudflare:workers";

type PendingExecution = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export class ExecutorConnectionDurableObject extends DurableObject {
  private sockets = new Set<WebSocket>();
  private pendingExecutions = new Map<string, PendingExecution>();

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");

    if (upgradeHeader === "websocket") {
      return this.handleWebSocketUpgrade(request);
    }

    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/execute") {
      return this.handleExecute(request);
    }

    return new Response("Not found", { status: 404 });
  }

  private handleWebSocketUpgrade(_request: Request): Response {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();
    this.sockets.add(server);

    server.addEventListener("message", (event) => {
      this.handleExecutorMessage(event.data as string);
    });

    server.addEventListener("close", () => {
      this.sockets.delete(server);
    });

    server.addEventListener("error", () => {
      this.sockets.delete(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleExecute(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      execution_id: string;
      tool_name: string;
      arguments: Record<string, unknown>;
      integration_id: string;
      user_id: string;
      context?: Record<string, unknown>;
    };

    if (this.sockets.size === 0) {
      return Response.json(
        {
          ok: false,
          error: {
            message:
              "Your local agent is currently offline. The request will be delivered when it reconnects.",
          },
        },
        { status: 503 },
      );
    }

    const socket = Array.from(this.sockets)[0];

    try {
      const result = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            const pending = this.pendingExecutions.get(body.execution_id);
            if (pending) {
              this.pendingExecutions.delete(body.execution_id);
              reject(new Error("The executor request timed out."));
            }
          }, 15_000);

          this.pendingExecutions.set(body.execution_id, {
            resolve,
            reject,
            timeout,
          });

          socket.send(JSON.stringify(body));
        },
      );

      return Response.json(result);
    } catch (error) {
      return Response.json(
        {
          ok: false,
          error: {
            message:
              error instanceof Error
                ? error.message
                : "The executor could not be reached.",
          },
        },
        { status: 504 },
      );
    }
  }

  private handleExecutorMessage(data: string) {
    try {
      const message = JSON.parse(data) as {
        execution_id?: string;
        ok?: boolean;
        state?: string;
        result?: Record<string, unknown>;
        error?: { message?: string };
      };

      const executionId = message.execution_id;
      if (!executionId) return;

      const pending = this.pendingExecutions.get(executionId);
      if (!pending) return;

      clearTimeout(pending.timeout);
      this.pendingExecutions.delete(executionId);

      pending.resolve(message);
    } catch {
      // Ignore invalid JSON from executor
    }
  }
}
