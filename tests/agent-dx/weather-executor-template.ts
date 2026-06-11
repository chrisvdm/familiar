/**
 * Minimal familiar executor template — a single HTTP server with one tool.
 *
 * This is the reference implementation for the agent DX challenge.
 * Agents can use this as a guide, but they should write their own version.
 */

import { createServer } from "node:http";

const PORT = process.env.PORT || 8787;

const server = createServer(async (req, res) => {
  if (req.url !== "/tools/execute" || req.method !== "POST") {
    res.writeHead(404);
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
    return;
  }

  const body = await new Promise<unknown>((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });
  });

  const payload = body as {
    tool_name?: string;
    arguments?: Record<string, unknown>;
    execution_id?: string;
  };

  if (payload.tool_name === "weather.get") {
    const city = payload.arguments?.city || "Unknown";

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        state: "completed",
        result: {
          summary: `The weather in ${city} is sunny and 22°C.`,
          data: { city, temperature: 22, condition: "sunny" },
        },
      }),
    );
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      ok: false,
      state: "failed",
      error: { message: `Unknown tool: ${payload.tool_name}` },
    }),
  );
});

server.listen(PORT, () => {
  console.log(`Weather executor running on http://localhost:${PORT}`);
  console.log(`Expose this to familiar with: familiar portal --port ${PORT}`);
});
