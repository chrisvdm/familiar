#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_BASE_URL =
  process.env.FAMILIAR_BASE_URL?.trim() || "https://familiar.chrsvdmrw.workers.dev";
const CONFIG_DIR = path.join(os.homedir(), ".familiar");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const print = (message = "") => process.stdout.write(`${message}\n`);
const printError = (message) => process.stderr.write(`${message}\n`);

const helpText = `familiar

Usage:
  familiar init [--host <url>]
  familiar login [--token <token>] [--host <url>]
  familiar account create [--host <url>]
  familiar account show [--host <url>] [--token <token>]
  familiar whoami [--host <url>] [--token <token>]
  familiar set-key <key> [--host <url>] [--token <token>]
  familiar set-url <url> [--host <url>] [--token <token>]
  familiar tools sync [--file <path>] [--host <url>] [--token <token>]
  familiar portal --port <port> [--host <url>] [--token <token>]
  familiar --help

Commands:
  init            Create an account, issue the first API token, and store it locally.
  login           Connect an existing account to the CLI via a browser-assisted flow.
                  Pass --token to import a token directly without opening a browser.
  account create  Create an account and issue the first API token.
  account show    Show the account for the current API token.
  whoami          Alias for account show.
  set-key         Set the OpenRouter AI provider key for the current project integration.
                  Reads FAMILIAR_TOKEN from .dev.vars in the current directory.
  set-url         Set the executor base URL familiar will call when tools run.
                  Reads FAMILIAR_TOKEN from .dev.vars in the current directory.
  tools sync      Sync tools from a JSON file (default: familiar.tools.json).
                  Reads FAMILIAR_TOKEN from .dev.vars in the current directory.
  portal          Start a local tunnel and keep familiar pointed at it.
                  Requires cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation

Options:
  --host <url>    Base URL for the familiar API. Default: ${DEFAULT_BASE_URL}
  --token <token> Use a token directly instead of the stored local token.
  --port <port>   Local port your executor is running on (required for portal).
  --file <path>   Path to tools JSON file (default: familiar.tools.json).
  --help          Show this help text.
`;

const parseArgs = (argv) => {
  const positionals = [];
  let host = DEFAULT_BASE_URL;
  let token;
  let port;
  let file;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--help" || value === "-h") {
      return {
        help: true,
        positionals: [],
        host,
        token,
        port,
      };
    }

    if (value === "--host") {
      host = argv[index + 1]?.trim() || host;
      index += 1;
      continue;
    }

    if (value === "--token") {
      token = argv[index + 1]?.trim();
      index += 1;
      continue;
    }

    if (value === "--port") {
      port = argv[index + 1]?.trim();
      index += 1;
      continue;
    }

    if (value === "--file") {
      file = argv[index + 1]?.trim();
      index += 1;
      continue;
    }

    positionals.push(value);
  }

  return {
    help: false,
    positionals,
    host,
    token,
    port,
    file,
  };
};

const ensureConfigDir = async () => {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
};

const saveConfig = async (config) => {
  await ensureConfigDir();
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
};

const loadConfig = async () => {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const loadDevVars = async () => {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), ".dev.vars"), "utf8");
    const match = raw.match(/^FAMILIAR_TOKEN=(.+)$/m);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
};

const resolveToken = async (explicitToken) => {
  if (explicitToken?.trim()) {
    return explicitToken.trim();
  }

  const devVarsToken = await loadDevVars();
  if (devVarsToken) {
    return devVarsToken;
  }

  const config = await loadConfig();
  return config?.token?.trim() || null;
};

const postJson = async ({ url, body, token }) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
  }

  return payload;
};

const getJson = async ({ url, token }) => {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
  }

  return payload;
};

const patchJson = async ({ url, body, token }) => {
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
  }

  return payload;
};

const runPortal = async ({ host, token, port }) => {
  const resolvedToken = await resolveToken(token);

  if (!resolvedToken) {
    throw new Error("No API token found. Run `familiar init` or pass `--token <token>`.");
  }

  if (!port) {
    throw new Error("--port is required. Example: familiar portal --port 8787");
  }

  const { execSync, spawn } = await import("node:child_process");

  try {
    execSync("cloudflared --version", { stdio: "pipe" });
  } catch {
    throw new Error(
      "cloudflared is not installed.\n" +
      "  macOS:   brew install cloudflared\n" +
      "  Windows: winget install Cloudflare.cloudflared\n" +
      "  Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation",
    );
  }

  const baseHost = host.replace(/\/$/, "");
  print(`Starting tunnel to http://localhost:${port}...`);

  let tunnelProc = null;
  let stopping = false;

  const registerUrl = async (tunnelUrl) => {
    print(`Registering ${tunnelUrl} with ${baseHost}...`);
    try {
      await patchJson({
        url: `${baseHost}/api/v1/integration`,
        body: { base_url: tunnelUrl },
        token: resolvedToken,
      });
      print(`Registered: ${tunnelUrl}`);
      print(`Ready. Keeping tunnel alive — press Ctrl-C to stop.`);
    } catch (err) {
      const detail = err.cause?.message ?? err.cause ?? err.message;
      printError(`Failed to register URL with familiar: ${detail}`);
    }
  };

  const startTunnel = () => {
    let registered = false;

    const proc = spawn(
      "cloudflared",
      ["tunnel", "--url", `http://localhost:${port}`],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    tunnelProc = proc;

    const handleLine = (data) => {
      const text = data.toString();
      if (!registered) {
        const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match) {
          registered = true;
          registerUrl(match[0]);
        }
      }
    };

    proc.stdout.on("data", handleLine);
    proc.stderr.on("data", handleLine);

    proc.on("close", (code) => {
      if (!stopping) {
        printError(`Tunnel exited (code ${code ?? "?"}) — restarting in 2s...`);
        setTimeout(startTunnel, 2000);
      }
    });
  };

  const cleanup = async () => {
    stopping = true;
    print(`\nShutting down...`);
    tunnelProc?.kill();
    try {
      await patchJson({
        url: `${baseHost}/api/v1/integration`,
        body: { base_url: null },
        token: resolvedToken,
      });
      print(`Cleared executor URL from familiar.`);
    } catch {
      // best effort
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  startTunnel();
};

const createAccount = async ({ host, shouldPersist }) => {
  const payload = await postJson({
    url: `${host.replace(/\/$/, "")}/api/v1/accounts`,
    body: {},
  });

  if (shouldPersist) {
    await saveConfig({
      host,
      token: payload.token.value,
      account_id: payload.account.id,
      created_at: new Date().toISOString(),
    });
  }

  print(`Account ID: ${payload.account.id}`);
  print(`API Token: ${payload.token.value}`);

  if (shouldPersist) {
    print(`Stored token at: ${CONFIG_PATH}`);
  }

  print(``);
  print(`Next steps:`);
  print(`  1. Add your token to .dev.vars in your project:`);
  print(`     FAMILIAR_TOKEN=${payload.token.value}`);
  print(``);
  print(`  2. Set your OpenRouter AI key (from your project directory):`);
  print(`     familiar set-key sk-or-v1-...`);
  print(``);
  print(`  Get an OpenRouter key at: https://openrouter.ai/keys`);
};

const setKey = async ({ host, token, key }) => {
  if (!key?.trim()) {
    throw new Error("Usage: familiar set-key <your-openrouter-key>");
  }

  const resolvedToken = await resolveToken(token);

  if (!resolvedToken) {
    throw new Error(
      "No API token found. Add FAMILIAR_TOKEN to .dev.vars or run `familiar init`.",
    );
  }

  await patchJson({
    url: `${host.replace(/\/$/, "")}/api/v1/integration`,
    body: { ai_api_key: key.trim() },
    token: resolvedToken,
  });

  print(`AI provider key set.`);
};

const setUrl = async ({ host, token, url: baseUrl }) => {
  if (!baseUrl?.trim()) {
    throw new Error("Usage: familiar set-url <your-executor-url>");
  }

  const resolvedToken = await resolveToken(token);

  if (!resolvedToken) {
    throw new Error(
      "No API token found. Add FAMILIAR_TOKEN to .dev.vars or run `familiar init`.",
    );
  }

  await patchJson({
    url: `${host.replace(/\/$/, "")}/api/v1/integration`,
    body: { base_url: baseUrl.trim() },
    token: resolvedToken,
  });

  print(`Executor URL set: ${baseUrl.trim()}`);
};

const syncTools = async ({ host, token, file }) => {
  const resolvedToken = await resolveToken(token);

  if (!resolvedToken) {
    throw new Error(
      "No API token found. Add FAMILIAR_TOKEN to .dev.vars or run `familiar init`.",
    );
  }

  const toolsPath = path.resolve(process.cwd(), file || "familiar.tools.json");
  let raw;

  try {
    raw = await fs.readFile(toolsPath, "utf8");
  } catch {
    throw new Error(`Tools file not found: ${toolsPath}`);
  }

  let tools;
  try {
    tools = JSON.parse(raw);
  } catch {
    throw new Error(`Tools file is not valid JSON: ${toolsPath}`);
  }

  if (!Array.isArray(tools)) {
    throw new Error(`Tools file must contain a JSON array of tools.`);
  }

  const payload = await postJson({
    url: `${host.replace(/\/$/, "")}/api/v1/tools/sync`,
    body: { tools },
    token: resolvedToken,
  });

  print(`Synced ${payload.synced_tools ?? tools.length} tool(s).`);
};

const showAccount = async ({ host, token }) => {
  const resolvedToken = await resolveToken(token);

  if (!resolvedToken) {
    throw new Error(
      "No API token found. Run `familiar init` or pass `--token <token>`.",
    );
  }

  const payload = await getJson({
    url: `${host.replace(/\/$/, "")}/api/v1/account`,
    token: resolvedToken,
  });

  print(`Account ID: ${payload.account.id}`);
  print(`Setup ID: ${payload.setup.id}`);
  print(`Token ID: ${payload.token.id}`);
  print(`Token Prefix: ${payload.token.prefix}`);
};

const openBrowser = async (url) => {
  const { spawn } = await import("node:child_process");
  const platform = process.platform;
  const cmd = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
};

const login = async ({ host, token }) => {
  if (token?.trim()) {
    if (!token.trim().startsWith("fam_")) {
      throw new Error(
        "Token format not recognised. Expected a token starting with fam_",
      );
    }
    await saveConfig({
      host,
      token: token.trim(),
      created_at: new Date().toISOString(),
    });
    print("Token saved.");
    return;
  }

  const baseHost = host.replace(/\/$/, "");

  const sessionPayload = await postJson({
    url: `${baseHost}/api/v1/auth/cli/sessions`,
    body: {},
  });
  const sessionId = sessionPayload.session_id;
  const completionSecret = sessionPayload.completion_secret;

  const browserUrl = `${baseHost}/auth/cli?session=${sessionId}&secret=${completionSecret}`;
  print(`Opening browser: ${browserUrl}`);
  await openBrowser(browserUrl);
  print(`Waiting for login… (Ctrl-C to cancel)`);

  const pollUrl = `${baseHost}/api/v1/auth/cli/sessions/${sessionId}`;
  const maxAttempts = 150;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    let result;
    try {
      const response = await fetch(pollUrl);
      result = await response.json();
    } catch {
      continue;
    }

    if (result.state === "completed") {
      await saveConfig({
        host,
        token: result.token,
        created_at: new Date().toISOString(),
      });
      print("Logged in.");
      return;
    }

    if (result.state === "expired") {
      throw new Error("Login expired. Run `familiar login` to try again.");
    }
  }

  throw new Error("Login timed out. Run `familiar login` to try again.");
};

const main = async () => {
  const { help, positionals, host, token, port, file } = parseArgs(process.argv.slice(2));

  if (help || positionals.length === 0) {
    print(helpText);
    return;
  }

  const command = positionals.join(" ");

  if (command === "init") {
    await createAccount({ host, shouldPersist: true });
    return;
  }

  if (command === "login") {
    await login({ host, token });
    return;
  }

  if (command === "account create") {
    await createAccount({ host, shouldPersist: false });
    return;
  }

  if (command === "account show" || command === "whoami") {
    await showAccount({ host, token });
    return;
  }

  if (command === "portal") {
    await runPortal({ host, token, port });
    return;
  }

  if (positionals[0] === "set-key") {
    await setKey({ host, token, key: positionals[1] });
    return;
  }

  if (positionals[0] === "set-url") {
    await setUrl({ host, token, url: positionals[1] });
    return;
  }

  if (command === "tools sync") {
    await syncTools({ host, token, file });
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${helpText}`);
};

main().catch((error) => {
  printError(error instanceof Error ? error.message : "Command failed.");
  process.exitCode = 1;
});
