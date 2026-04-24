#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_BASE_URL =
  process.env.FAMILIAR_BASE_URL?.trim() || "https://familiar.chrsvdmrw.workers.dev";
const CONFIG_DIR = path.join(os.homedir(), ".codex", "familiar");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const print = (message = "") => process.stdout.write(`${message}\n`);
const printError = (message) => process.stderr.write(`${message}\n`);

const helpText = `familiar

Usage:
  familiar init [--host <url>]
  familiar account create [--host <url>]
  familiar account show [--host <url>] [--token <token>]
  familiar whoami [--host <url>] [--token <token>]
  familiar portal --port <port> [--host <url>] [--token <token>]
  familiar --help

Commands:
  init            Create an account, issue the first API token, and store it locally.
  account create  Create an account and issue the first API token.
  account show    Show the account for the current API token.
  whoami          Alias for account show.
  portal          Start a local tunnel and keep familiar pointed at it.
                  Requires cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation

Options:
  --host <url>    Base URL for the familiar API. Default: ${DEFAULT_BASE_URL}
  --token <token> Use a token directly instead of the stored local token.
  --port <port>   Local port your executor is running on (required for portal).
  --help          Show this help text.
`;

const parseArgs = (argv) => {
  const positionals = [];
  let host = DEFAULT_BASE_URL;
  let token;
  let port;

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

    positionals.push(value);
  }

  return {
    help: false,
    positionals,
    host,
    token,
    port,
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

const resolveToken = async (explicitToken) => {
  if (explicitToken?.trim()) {
    return explicitToken.trim();
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
  print(`Next step: set your AI provider key so familiar can make model calls on your behalf.`);
  print(`  familiar set-key <your-openrouter-key>`);
  print(`  -- or --`);
  print(`  curl -X PATCH ${host}/api/v1/integration \\`);
  print(`    -H "Authorization: Bearer ${payload.token.value}" \\`);
  print(`    -H "Content-Type: application/json" \\`);
  print(`    -d '{"ai_api_key": "sk-or-v1-..."}'`);
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

const main = async () => {
  const { help, positionals, host, token, port } = parseArgs(process.argv.slice(2));

  if (help || positionals.length === 0) {
    print(helpText);
    return;
  }

  const command = positionals.join(" ");

  if (command === "init") {
    await createAccount({ host, shouldPersist: true });
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

  throw new Error(`Unknown command: ${command}\n\n${helpText}`);
};

main().catch((error) => {
  printError(error instanceof Error ? error.message : "Command failed.");
  process.exitCode = 1;
});
