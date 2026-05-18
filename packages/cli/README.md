# familiar-cli

> **Early development.** This is an MVP release. Expect breaking changes.

Command-line tool for setting up and managing [familiar](https://familiar.monster) — a hosted tool router with memory.

## Install

```shell
npm install -g familiar-cli
```

## Onboarding

### 1. Create an account

Run this once to create your familiar account and get an API token:

```shell
familiar init
```

This stores the token globally and prints your next steps.

You can also import an existing token:

```shell
familiar init --token fam_your_token
```

### 2. Add your token to the project

In your project root, add the token to `.dev.vars`:

```text
FAMILIAR_TOKEN=fam_your_token
```

`.dev.vars` should be gitignored. All subsequent CLI commands read the token from this file.

### 3. Set your AI provider key

familiar uses [OpenRouter](https://openrouter.ai) for model calls. Each integration needs its own key.

Get a key at [openrouter.ai/keys](https://openrouter.ai/keys), then from your project root:

```shell
familiar set-key sk-or-v1-your_openrouter_key
```

### 4. Sync your tools

Create a `familiar.tools.json` file in your project root:

```json
[
  {
    "tool_name": "spreadsheet.update_row",
    "description": "Update a row in the spreadsheet",
    "input_schema": {
      "type": "object",
      "properties": {
        "row_id": { "type": "string" },
        "values": { "type": "object" }
      },
      "required": ["row_id", "values"]
    },
    "status": "active"
  }
]
```

Then sync from your project root:

```shell
familiar tools sync
```

Run this again whenever your tool definitions change.

### 5. Start the tunnel

familiar is hosted and cannot reach `localhost` directly. Run this in a second terminal while developing:

```shell
familiar portal --port 8787
```

This starts a Cloudflare tunnel, registers the URL with familiar, and keeps it alive. Press `Ctrl-C` to stop — it clears the URL automatically.

Requires [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation).

## Commands

### `familiar init`

Create a familiar account and issue the first API token. Stores the token globally.

This calls `POST /api/v1/accounts` and saves the returned token to `~/.familiar/config.json`.

### `familiar login`

Open the familiar dashboard in your browser, already logged in.

```shell
familiar login
```

Reads the token from `~/.familiar/config.json`, creates a one-time browser login code, and opens the dashboard.

### `familiar set-key <key>`

Set the OpenRouter AI provider key for the current project integration. Reads `FAMILIAR_TOKEN` from `.dev.vars` in the current directory.

### `familiar set-url <url>`

Set the executor base URL that familiar will call when tools run. Use this when your executor is already deployed (e.g., on Vercel, Railway, or your own server) instead of using `familiar portal`.

```shell
familiar set-url https://my-app.vercel.app
```

To clear the URL later:

```shell
familiar set-url ""
```

### `familiar tools sync [--file <path>]`

Sync tools from a JSON file. Defaults to `familiar.tools.json` in the current directory. Use `--file` to point to a different path.

### `familiar portal --port <port>`

Start a local tunnel to the given port, register it with familiar, and keep it alive. Re-registers automatically if the tunnel restarts.

### `familiar account show` / `familiar whoami`

Show the account details for the current token.

## Authentication

The CLI uses API tokens for all operations. Tokens are long-lived machine credentials.

Token sources (checked in order):

1. `--token <token>` flag (explicit override)
2. `FAMILIAR_TOKEN` in `.dev.vars` (project-level)
3. `~/.familiar/config.json` (global, set by `familiar init`)

Web dashboard users can find their full API token on the dashboard and import it with `familiar init --token <token>`.

## Options

| Option | Description |
|---|---|
| `--host <url>` | familiar API base URL. Defaults to the hosted instance. |
| `--token <token>` | Use a token directly instead of reading from `.dev.vars` or the global config. |
| `--file <path>` | Path to tools JSON file (for `tools sync`). |
| `--port <port>` | Local port to tunnel (for `portal`). |
