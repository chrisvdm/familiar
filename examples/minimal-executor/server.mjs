import { createServer } from "node:http";

const port = Number(process.env.PORT || 8787);
const expectedToken = (process.env.TEXTY_EXECUTOR_TOKEN || "dev-token").trim();

const sendJson = (response, status, body) => {
  response.writeHead(status, {
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(body));
};

const readJsonBody = async (request) => {
  let body = "";

  for await (const chunk of request) {
    body += chunk;
  }

  return JSON.parse(body || "{}");
};

const unauthorized = (response) =>
  sendJson(response, 401, {
    ok: false,
    state: "failed",
    error: {
      code: "unauthorized",
      message: "Missing or invalid executor token.",
    },
  });

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/tools/execute") {
    sendJson(response, 404, {
      ok: false,
      state: "failed",
      error: {
        code: "not_found",
        message: "Route not found.",
      },
    });
    return;
  }

  const authHeader = request.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token || token !== expectedToken) {
    unauthorized(response);
    return;
  }

  let payload;

  try {
    payload = await readJsonBody(request);
  } catch {
    sendJson(response, 400, {
      ok: false,
      state: "failed",
      error: {
        code: "invalid_json",
        message: "Request body must be valid JSON.",
      },
    });
    return;
  }

  if (payload.tool_name !== "notes.echo") {
    sendJson(response, 400, {
      ok: false,
      state: "failed",
      error: {
        code: "unknown_tool",
        message: `Unknown tool: ${payload.tool_name || "missing"}.`,
      },
    });
    return;
  }

  const note = String(payload.arguments?.note || "").trim();

  if (!note) {
    sendJson(response, 200, {
      ok: true,
      state: "needs_clarification",
      result: {
        summary: "What note should I save?",
      },
    });
    return;
  }

  sendJson(response, 200, {
    ok: true,
    state: "completed",
    result: {
      summary: `Saved note: ${note}`,
      data: {
        note,
      },
    },
  });
});

server.listen(port, () => {
  console.log(`Minimal executor listening on http://localhost:${port}`);
});
