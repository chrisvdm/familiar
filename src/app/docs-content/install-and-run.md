# Install And Run

This is the normal hosted setup path for using *familiar*.

If you are new here, use these steps in order.

## Step 1: Create your account

Use one of these working paths today.

### In your browser

Open:

```text
https://familiar.chrsvdmrw.workers.dev/setup
```

That page creates an account and shows your first API token once.

### Through the API

```sh
curl -X POST https://familiar.chrsvdmrw.workers.dev/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{}'
```

That returns your first API token.

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

## CLI Status

The CLI remains the intended primary setup path for humans and AI agents.

The package is being prepared as:

```text
@familiar/cli
```

Planned commands:

```sh
npx @familiar/cli@latest init
```

and:

```sh
npm install -g @familiar/cli
familiar init
```

Until npm publish is live, use the browser or API path above.

For local development or alternate hosted environments, the CLI helper in this repo already supports overriding the base URL with:

```sh
familiar init --host http://localhost:5173
```

or:

```sh
FAMILIAR_BASE_URL=http://localhost:5173 familiar whoami
```

That means local auth state should be treated as host-aware rather than assuming one global token for every environment.

## Contributor Docs

If you want to work on the codebase itself rather than use the hosted product, go to:

- [Local Development](/docs/local-development)
