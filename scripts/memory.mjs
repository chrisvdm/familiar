#!/usr/bin/env node

const BASE_URL = process.env.TEXTY_BASE_URL || "http://localhost:5173";
const DEFAULT_USER_ID = "demo_user";

const SANDBOXES = [
  "demo-executor",
  "async-countdown",
  "pinned-tool",
];

const usage = () => {
  console.log("Usage: npm run memory <command> [user_id]");
  console.log("");
  console.log("Commands:");
  console.log("  reset [user_id]   Wipe memory context for all sandboxes");
  console.log("  debug [user_id]   Print stored memory context for all sandboxes");
  console.log("");
  console.log("Defaults: user_id=demo_user, base URL=http://localhost:5173");
  console.log("Override base URL with TEXTY_BASE_URL env var.");
  process.exit(1);
};

const [,, command, userId = DEFAULT_USER_ID] = process.argv;

if (!command) {
  usage();
}

const resetSandbox = async (sandbox) => {
  const url = `${BASE_URL}/sandbox/${sandbox}/reset?user_id=${encodeURIComponent(userId)}`;
  const response = await fetch(url, { method: "POST" });
  const body = await response.json();

  if (body.ok) {
    console.log(`  ✓ ${sandbox} — reset`);
  } else {
    console.log(`  ✗ ${sandbox} — ${JSON.stringify(body)}`);
  }
};

const debugSandbox = async (sandbox) => {
  const url = `${BASE_URL}/sandbox/${sandbox}/debug?user_id=${encodeURIComponent(userId)}`;
  const response = await fetch(url);
  const body = await response.json();

  console.log(`\n── ${sandbox} ──`);
  console.log(JSON.stringify(body, null, 2));
};

if (command === "reset") {
  console.log(`Resetting memory for user "${userId}" across all sandboxes...`);
  await Promise.all(SANDBOXES.map(resetSandbox));
  console.log("Done.");
} else if (command === "debug") {
  console.log(`Memory context for user "${userId}":`);
  for (const sandbox of SANDBOXES) {
    await debugSandbox(sandbox);
  }
} else {
  console.error(`Unknown command: ${command}`);
  usage();
}
