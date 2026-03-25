# Local Development

This page is for contributors working on the *familiar* codebase itself.

If you only want to use hosted *familiar*, go back to:

- [Install And Run](/docs/install-and-run)

## What this environment is

The local codebase is a RedwoodSDK app running a local *familiar* worker.

That worker includes:

- the web UI
- the `/docs` pages
- the current integration API routes
- the conversation and tool orchestration runtime

## Prerequisites

You need:

- Node.js
- npm
- an OpenRouter API key

## Step 1: Install dependencies

From the project root:

```sh
npm install
```

## Step 2: Create `.dev.vars`

Copy the example file:

```sh
cp .dev.vars.example .dev.vars
```

Then edit `.dev.vars` and set at least:

```text
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_MEMORY_MODEL=openai/gpt-4o-mini
OPENROUTER_SITE_URL=http://localhost:5173
OPENROUTER_SITE_NAME=familiar
```

## Step 3: Run the app

Start the local worker:

```sh
npm run dev
```

The local app runs at:

```text
http://localhost:5173
```

## Step 4: Try the local examples

Useful pages:

- `http://localhost:5173/docs/`
- `http://localhost:5173/sandbox/demo-executor`
- `http://localhost:5173/sandbox/async-countdown`
- `http://localhost:5173/sandbox/pinned-tool`

## Step 5: Run a local example executor

For the smallest useful executor:

```sh
TEXTY_EXECUTOR_TOKEN=dev-token node examples/minimal-executor/server.mjs
```

That example listens on:

```text
http://localhost:8787
```

Then add this to `.dev.vars`:

```text
TEXTY_EXECUTOR_CONFIG='{"demo_executor":{"token":"dev-token","baseUrl":"http://localhost:8787"}}'
```

After that, restart `npm run dev` if it is already running.

## Local Mental Model

When running locally:

- your app or webhook sends normalized text into *familiar*
- *familiar* owns thread, memory, and tool orchestration
- the executor owns the real side effects
