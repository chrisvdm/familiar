# CLI

`familiar-cli` is the command-line tool for setting up and managing *familiar* integrations.

## Install

```shell
npm install -g familiar-cli
```

Or run without installing:

```shell
npx familiar-cli init
```

## Onboarding

Run these steps once to get a local project connected to *familiar*.

### 1. Create or connect an account

If this is your first time using *familiar*, create a new account:

```shell
familiar init
```

Creates an account, issues the first API token, and stores it in `~/.familiar/config.json`.

If you already have an account (from the web setup or another machine), import the token:

```shell
familiar init --token fam_your_token
```

Validates the token and stores it locally.

### 2. Add the token to your project

In your project root, create or edit `.dev.vars`:

```text
FAMILIAR_TOKEN=fam_your_token
```

Keep `.dev.vars` out of version control. All subsequent CLI commands read the token from this file automatically.

### 3. Set your AI provider key

*familiar* uses [OpenRouter](https://openrouter.ai) for model calls. Each integration needs its own key before it can process messages.

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

Then sync:

```shell
familiar tools sync
```

Run this again whenever tool definitions change.

### 5. Start the portal

*familiar* is hosted and cannot reach `localhost` directly. The portal manages a local tunnel so *familiar* can call your executor during development.

In a second terminal, from your project root:

```shell
familiar portal --port 8787
```

This starts a Cloudflare tunnel pointed at the given port, registers the URL with *familiar*, and keeps it alive. If the tunnel restarts, the portal re-registers the new URL automatically. Press `Ctrl-C` to stop — it clears the executor URL from *familiar* on exit.

Requires [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation).

## Commands

### `familiar init`

Create an account and issue the first API token. Stores the token globally at `~/.familiar/config.json`.

```shell
familiar init
familiar init --host http://localhost:5173
```

### `familiar login`

Open the *familiar* dashboard in your browser, already logged in with the token from your CLI config.

```shell
familiar login
familiar login --host http://localhost:5173
```

Reads the token from `~/.familiar/config.json`, creates a one-time browser login code, and opens the dashboard. No polling, no copy-paste.

### `familiar set-key <key>`

Set the OpenRouter AI provider key for the current project integration.

Reads `FAMILIAR_TOKEN` from `.dev.vars` in the current directory.

```shell
familiar set-key sk-or-v1-your_openrouter_key
```

Only OpenRouter keys are accepted. The key must start with `sk-or-v1-`.

### `familiar set-url <url>`

Set the executor base URL for the current project integration.

Reads `FAMILIAR_TOKEN` from `.dev.vars` in the current directory.

```shell
familiar set-url https://your-executor.example.com
```

This is an alternative to using `familiar portal` when you already have a public URL.

### `familiar tools sync`

Sync tools from a JSON file. Defaults to `familiar.tools.json` in the current directory.

```shell
familiar tools sync
familiar tools sync --file path/to/tools.json
```

Reads `FAMILIAR_TOKEN` from `.dev.vars` in the current directory.

### `familiar portal --port <port>`

Start a local tunnel to the given port, register it with *familiar*, and keep it alive.

```shell
familiar portal --port 8787
```

Reads `FAMILIAR_TOKEN` from `.dev.vars` in the current directory.

### `familiar models`

Show which AI models are configured for the current *familiar* deployment.

```shell
familiar models
```

Outputs a table of routing mode and per-stage model assignments (reply, routing, extraction, memory selector, synthesis).

### `familiar account show` / `familiar whoami`

Show the account details for the current token.

```shell
familiar account show
familiar whoami
```



## Options

| Option | Description |
|---|---|
| `--host <url>` | *familiar* API base URL. Defaults to the hosted instance. |
| `--token <token>` | Use a token directly instead of reading from `.dev.vars` or the global config. |
| `--file <path>` | Path to tools JSON file. Used with `tools sync`. |
| `--port <port>` | Local port to tunnel. Used with `portal`. |

## Token resolution

The CLI resolves a token in this order:

1. `--token` flag on the command
2. `FAMILIAR_TOKEN` in `.dev.vars` in the current directory
3. Token stored in `~/.familiar/config.json`

Commands that act on a project integration (`set-key`, `tools sync`, `portal`) read from `.dev.vars` so different projects can use different tokens from the same machine.