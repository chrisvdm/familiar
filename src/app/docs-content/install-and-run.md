# Install And Run

This is the normal hosted setup path for using *familiar*.

If you are new here, use these steps in order.

## Step 1: Install the CLI

Open your terminal.

Copy and run:

```sh
curl -fsSL https://familiar.sh/install | sh
```

What this does:

- downloads the familiar command-line tool
- installs it on your machine
- lets you use commands like `familiar init`

If you have never used `curl` before, that is okay.
You can treat the command above as a single install command to copy and paste into your terminal.

## Step 2: Create your account

Run:

```sh
familiar init
```

What this does:

- creates your *familiar* account
- creates your first API token
- stores that token locally so later CLI commands can use it

By default, the CLI talks to:

```text
https://texty.chrsvdmrw.workers.dev
```

You only need `--host` if you are using a different environment.

## Step 3: Check that it worked

Run:

```sh
familiar whoami
```

That shows the account connected to your stored API token.

## Step 4: Connect your app or bot

Once you have a token, your app, bot, or webhook can call the hosted API.

The normal flow is:

1. sync tools with *familiar*
2. send normalized text to *familiar*
3. let *familiar* decide whether to reply, clarify, or call your executor
4. if your executor is async, send the final result back through the executor webhook

## Step 5: Read the next docs

Use these pages next:

- [Quickstart](/docs/quickstart)
- [API Reference](/docs/api-reference)
- [Integrations](/docs/integrations)
- [Executors](/docs/executors)
- [Webhooks](/docs/webhooks)

## No CLI?

If you cannot use the CLI yet, you can still create an account directly through the API:

```sh
curl -X POST https://texty.chrsvdmrw.workers.dev/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{}'
```

That returns your first API token.

## Contributor Docs

If you want to work on the codebase itself rather than use the hosted product, go to:

- [Local Development](/docs/local-development)
