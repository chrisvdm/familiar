# Minimal Executor

This is the smallest useful example of an executor that can connect to Texty.

This file is meant to answer the practical question:

- "What do I actually build if I want Texty to call my code?"

It does one thing:

- exposes `POST /tools/execute`
- accepts one tool, `notes.echo`
- returns either a clarification or a completed result

It also gives you a no-signup demo path:

- a fixed demo executor id
- a fixed demo user id
- a fixed demo token

So you can test the Texty flow without creating an account first.

## What To Do With This Folder

You have two easy options:

1. Read it to understand the shape of a Texty executor.
2. Copy it into your own project and change it to do real work.

If you are just getting started, the easiest path is:

1. copy `server.mjs` into your own project
2. run it locally
3. connect Texty to it
4. replace the fake `notes.echo` tool with your real tool

So yes, the folder is there to be copied, run, and adapted.

## Files

- `server.mjs`
  - tiny local HTTP server using only Node built-ins
- `index.html`
  - the small local browser UI shown at `http://localhost:8787`
- `texty.json`
  - example manifest shape for this executor

## Run It

Start the example server:

From the project root:

```shell
TEXTY_EXECUTOR_TOKEN=dev-token node examples/minimal-executor/server.mjs
```

If you are already inside the `examples/minimal-executor` folder:

```shell
TEXTY_EXECUTOR_TOKEN=dev-token node server.mjs
```

What this does:

- starts a local server
- serves a local test page at `GET /`
- listens for `POST /tools/execute`
- exposes a local route that sends input through Texty
- checks the bearer token
- returns a simple JSON result

It listens on:

```text
http://localhost:8787
```

If you open that address in your browser, you will now see a small local test UI.

That page lets you:

- type normal user input
- send that input through Texty
- see the Texty requests and responses

This page is the marketing example, so it uses Texty itself rather than
skipping around it.

It uses pre-filled demo identity values so you can test the flow immediately.

## Local Texty Config

Point local Texty at this executor:

```shell
TEXTY_EXECUTOR_CONFIG='{"demo_executor":{"token":"dev-token","baseUrl":"http://localhost:8787"}}'
```

What this means:

- `demo_executor`
  - the executor id Texty will use for this connection
- `token`
  - the shared token Texty and your executor both know
- `baseUrl`
  - where Texty should send tool-execution requests

You do not need to manually create `demo_executor` or `demo_user` first. Texty
creates the demo provider-user context the first time the tool sync or input
request arrives.

## Sync The Tool

```shell
curl -X POST http://localhost:5173/api/v1/providers/demo_executor/users/demo_user/tools/sync \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "demo_executor",
    "user_id": "demo_user",
    "tools": [
      {
        "tool_name": "notes.echo",
        "description": "Save a short note. Use this only when the user clearly asks to save or add a note. The note field should contain only the note text itself, not instruction words.",
        "input_schema": {
          "type": "object",
          "properties": {
            "note": {
              "type": "string",
              "description": "Only the note content, for example wash hair. Do not include phrases like add to note or save this note."
            }
          },
          "required": ["note"]
        },
        "status": "active"
      }
    ]
  }'
```

## Send Input

```shell
curl -X POST http://localhost:5173/api/v1/input \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "demo_executor",
    "user_id": "demo_user",
    "input": {
      "kind": "text",
      "text": "Save this note: buy dog food"
    },
    "channel": {
      "type": "web",
      "id": "local-browser"
    }
  }'
```

Texty should decide to call `notes.echo`, then the executor will reply with a completed result.

## Browser Test Page

Once the server is running, open:

```text
http://localhost:8787
```

That page is only for local testing. It is there to make the example easier to understand.

It uses Texty. It shows:

- the request Texty receives
- the sync request used to register the example tool
- the response Texty returns

## What Happens Next

After you send that request:

1. Texty receives the user message.
2. Texty decides that work should be handed off.
3. Texty sends a `POST /tools/execute` request to your local executor.
4. Your executor returns JSON.
5. Texty turns that result into the assistant reply.

That is the basic integration loop.

## How To Adapt It

Once you understand the example, the normal next step is:

- keep the same route shape
- keep the same token check
- replace `notes.echo` with your own tool
- replace the fake response with real work

Examples:

- update a spreadsheet
- send an email
- create a record
- run a script
