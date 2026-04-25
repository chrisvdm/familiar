# Install And Run

This is the normal hosted setup path for using *familiar*.

If you are new here, use these steps in order.

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

## Step 2: Connect your app or bot

Once you have a token, your app, bot, or webhook can call the hosted API.

The normal flow is:

1. sync tools with *familiar*
2. send normalized text to *familiar*
3. let *familiar* decide whether to reply, clarify, or call your executor
4. if your executor is async, send the final result back through the executor webhook

## Step 3: Read the next docs

Use these pages next:

- [Quickstart](/docs/quickstart)
- [API Reference](/docs/api-reference)
- [Integrations](/docs/integrations)
- [Executors](/docs/executors)
- [Webhooks](/docs/webhooks)

## CLI

The CLI is published as `familiar-cli`.

```sh
npm install -g familiar-cli
```

For local development or alternate hosted environments, override the base URL with:

```sh
familiar init --host http://localhost:5173
```

or:

```sh
FAMILIAR_BASE_URL=http://localhost:5173 familiar whoami
```

Auth state is host-aware — there is no single global token across environments.

## Contributor Docs

If you want to work on the codebase itself rather than use the hosted product, go to:

- [Local Development](/docs/local-development)
