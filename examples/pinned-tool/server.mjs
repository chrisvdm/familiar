import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  executeToolCall,
  getToolEntriesForUser,
  toolDefinitions,
} from "./executor.mjs";

const port = Number(process.env.PORT || 8791);
const expectedToken = (process.env.TEXTY_EXECUTOR_TOKEN || "dev-token").trim();
const textyBaseUrl = (process.env.TEXTY_BASE_URL || "http://localhost:5173").trim();
const integrationId = (process.env.TEXTY_INTEGRATION_ID || "demo_held_tool").trim();
const defaultUserId = (process.env.TEXTY_USER_ID || "demo_user").trim();
const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const homePageTemplate = readFileSync(join(currentDir, "index.html"), "utf8");

const renderHomePage = () =>
  homePageTemplate
    .replaceAll("__PORT__", String(port))
    .replaceAll("__TOKEN__", expectedToken)
    .replaceAll("__TEXTY_BASE_URL__", textyBaseUrl)
    .replaceAll("__INTEGRATION_ID__", integrationId)
    .replaceAll("__USER_ID__", defaultUserId)
    .replaceAll("__PLAYGROUND_PATH__", "/playground/texty")
    .replaceAll("__NONCE__", "");

const buildSyncBody = (userId) => ({
  integration_id: integrationId,
  user_id: userId,
  tools: toolDefinitions,
});

const buildInputBody = (userId, text) => ({
  integration_id: integrationId,
  user_id: userId,
  input: {
    kind: "text",
    text,
  },
  channel: {
    type: "web",
    id: "pinned-tool-playground",
  },
});

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

const syncToolsWithTexty = async ({ token, userId }) => {
  const response = await fetch(
    `${textyBaseUrl.replace(/\/$/, "")}/api/v1/integrations/${integrationId}/users/${userId}/tools/sync`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildSyncBody(userId)),
    },
  );

  return {
    status: response.status,
    body: await response.json(),
  };
};

const runTextyInput = async ({ token, userId, text }) => {
  const response = await fetch(`${textyBaseUrl.replace(/\/$/, "")}/api/v1/input`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildInputBody(userId, text)),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
};

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
    });
    response.end(renderHomePage());
    return;
  }

  if (request.method === "POST" && request.url === "/playground/texty") {
    let payload;

    try {
      payload = await readJsonBody(request);
    } catch {
      sendJson(response, 400, {
        ok: false,
        error: {
          code: "invalid_json",
          message: "Request body must be valid JSON.",
        },
      });
      return;
    }

    const token = String(payload.token || "").trim();
    const userId = String(payload.user_id || defaultUserId).trim();
    const text = String(payload.text || "").trim();

    if (!token || token !== expectedToken) {
      unauthorized(response);
      return;
    }

    if (!text) {
      sendJson(response, 400, {
        ok: false,
        error: {
          code: "missing_text",
          message: "Text input is required.",
        },
      });
      return;
    }

    try {
      const syncResult = await syncToolsWithTexty({
        token,
        userId,
      });
      const textyResult = await runTextyInput({
        token,
        userId,
        text,
      });

      sendJson(response, 200, {
        ok: true,
        demo_identity: {
          integration_id: integrationId,
          user_id: userId,
        },
        transcript: {
          user: text,
          assistant: textyResult.body?.response?.content ?? "",
        },
        response: textyResult.body?.response ?? null,
        execution: textyResult.body?.execution ?? null,
        captured: {
          notes: getToolEntriesForUser({
            toolName: "notes.capture",
            userId,
          }),
          ideas: getToolEntriesForUser({
            toolName: "ideas.capture",
            userId,
          }),
        },
        observed: {
          sync_status: syncResult.status,
          sync_response: syncResult.body,
          input_status: textyResult.status,
          input_response: textyResult.body,
        },
      });
    } catch (error) {
      sendJson(response, 502, {
        ok: false,
        error: {
          code: "texty_unreachable",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }

    return;
  }

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

  const result = executeToolCall({
    payload,
    defaultUserId,
  });

  sendJson(response, result.state === "failed" ? 400 : 200, result);
});

server.listen(port, () => {
  console.log(`Pinned tool executor listening on http://localhost:${port}`);
});
