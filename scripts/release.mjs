import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

const prompt = async (message) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.on("SIGINT", () => {
      rl.close();
      process.exit(1);
    });

    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });

const run = (command, args, { input, allowFailure = false } = {}) => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: input == null ? "inherit" : ["pipe", "pipe", "pipe"],
    encoding: "utf8",
    input,
    shell: false,
    env: process.env,
  });

  if (!allowFailure && result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
};

const runWithCapturedOutput = (command, args, input) => {
  const result = run(command, args, {
    input,
    allowFailure: true,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  return result;
};

const parseWranglerName = async () => {
  const content = await readFile("wrangler.jsonc", "utf8");
  const nameMatch = content.match(/"name"\s*:\s*"([^"]+)"/);

  if (!nameMatch?.[1]) {
    throw new Error("Unable to read worker name from wrangler.jsonc");
  }

  return nameMatch[1];
};

const ensureCloudflareAccountSetup = () => {
  if (
    process.env.CLOUDFLARE_ACCOUNT_ID != null &&
    process.env.CLOUDFLARE_API_TOKEN != null
  ) {
    return;
  }

  console.log("Checking Cloudflare account setup...");
  run("npx", ["wrangler", "d1", "list", "--json"]);
};

const ensureWorkerExists = async () => {
  const workerName = await parseWranglerName();

  console.log(`Ensuring worker ${workerName} exists...`);

  const secretPut = () =>
    runWithCapturedOutput(
      "npx",
      ["wrangler", "secret", "put", "TMP_WORKER_CREATED"],
      "true\n",
    );

  let result = secretPut();

  const versionBlockMessage =
    "the latest version of your Worker isn't currently deployed";

  if (
    result.status !== 0 &&
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`
      .toLowerCase()
      .includes(versionBlockMessage)
  ) {
    console.log(
      "Worker secret edit is blocked until the latest Worker version is deployed. Running a bootstrap deploy first...",
    );
    run("npm", ["run", "clean"]);
    run("npm", ["run", "build"]);
    run("npx", ["wrangler", "deploy"]);
    result = secretPut();
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const ensureAuthSecret = async () => {
  const sourceFiles = run(
    "rg",
    ["-l", "rwsdk/auth", "src"],
    { allowFailure: true },
  );

  if (sourceFiles.status !== 0) {
    console.log("Skipping AUTH_SECRET_KEY setup - no auth usage detected in codebase");
    return;
  }

  console.log("Found auth usage, checking secret setup...");

  const listResult = spawnSync(
    "npx",
    ["wrangler", "secret", "list", "--format=json"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["inherit", "pipe", "pipe"],
      env: process.env,
    },
  );

  if (listResult.stdout) process.stdout.write(listResult.stdout);
  if (listResult.stderr) process.stderr.write(listResult.stderr);

  if (listResult.status !== 0) {
    process.exit(listResult.status ?? 1);
  }

  const secrets = JSON.parse(listResult.stdout || "[]");

  if (secrets.some((secret) => secret?.name === "AUTH_SECRET_KEY")) {
    console.log("AUTH_SECRET_KEY secret already exists in Cloudflare, skipping");
    return;
  }

  const secretValue = spawnSync(
    "node",
    ["-e", "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["inherit", "pipe", "inherit"],
      env: process.env,
    },
  );

  if (secretValue.status !== 0 || !secretValue.stdout) {
    process.exit(secretValue.status ?? 1);
  }

  const putResult = runWithCapturedOutput(
    "npx",
    ["wrangler", "secret", "put", "AUTH_SECRET_KEY"],
    `${secretValue.stdout}\n`,
  );

  if (putResult.status !== 0) {
    process.exit(putResult.status ?? 1);
  }

  console.log("Set AUTH_SECRET_KEY secret");
};

const main = async () => {
  const confirmed = await prompt("Do you want to proceed with deployment? (y/N): ");

  if (!confirmed) {
    console.log("Deployment cancelled.");
    process.exit(1);
  }

  console.log("Ensuring deployment environment is ready...");
  ensureCloudflareAccountSetup();
  await ensureWorkerExists();
  await ensureAuthSecret();
  run("npm", ["run", "clean"]);
  run("npm", ["run", "build"]);
  run("npx", ["wrangler", "deploy"]);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
