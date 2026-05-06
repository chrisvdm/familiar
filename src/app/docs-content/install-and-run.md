# Install And Run

This is the normal hosted setup path for using *familiar*.

## Step 1: Create your account

Use one of these paths.

### Through the CLI

```sh
npx familiar-cli init
```

That creates an account, issues the first API token, and stores it locally.

### Through the API

```sh
curl -X POST https://familiar.chrsvdmrw.workers.dev/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{}'
```

That returns your first API token.

### In your browser

Open:

```text
https://familiar.chrsvdmrw.workers.dev/setup
```

That page creates an account and shows your first API token once.

## Step 2: Choose your integration path

Once you have a token, pick the path that fits how you work.

### CLI

The recommended path for setting up and managing an integration.

```sh
npm install -g familiar-cli
```

The CLI handles account setup, AI key configuration, tool sync, and the local tunnel for development. See [CLI](/docs/cli) for the full reference.

### SDK

The recommended path for sending input and syncing tools from your own code.

```sh
npm install familiar-sdk
```

The SDK is a typed JavaScript and TypeScript client with zero runtime dependencies. See [SDK](/docs/sdk) for the full reference.

### API

Call the HTTP API directly from any HTTP client. See [Quickstart](/docs/quickstart) for a step-by-step walkthrough and [API Reference](/docs/api-reference) for the full endpoint surface.

## Step 3: Read the next docs

- [CLI](/docs/cli) — full CLI command reference
- [SDK](/docs/sdk) — full SDK reference
- [Quickstart](/docs/quickstart) — step-by-step API walkthrough
- [API Reference](/docs/api-reference) — all endpoints
- [Executors](/docs/executors) — what your executor needs to expose
- [Webhooks](/docs/webhooks) — async executor result callbacks

## Contributor Docs

If you want to work on the codebase itself rather than use the hosted product, go to:

- [Local Development](/docs/local-development)
