# Minimal Executor

This is the smallest useful example of an executor that can connect to Texty.

This folder answers the practical question:

- "What do I actually build if I want Texty to call my code?"

It does one thing:

- exposes `POST /tools/execute`
- accepts one tool, `todos.add`
- updates a visible todo list in the browser demo

The example is now split into two parts:

- transport/server code
- executor logic

That separation is deliberate so the executor API shape is easy to see.

That visual todo list is intentional.

It makes the side effect obvious without forcing someone to read raw response JSON first.

## What This Example Shows

The flow is:

1. the browser sends a normal user message
2. the example syncs the allowed tool with Texty
3. the example sends the message to Texty
4. Texty decides whether to reply normally or call the tool
5. if the tool runs, the external executor updates the todo list
6. the browser shows both the assistant reply and the visible todo state

So the person trying the demo can immediately see:

- what they said
- how Texty responded
- whether a tool ran
- what changed in external state

## Files

- `server.mjs`
  - tiny local HTTP server using only Node built-ins
  - handles auth, JSON parsing, and routes
- `executor.mjs`
  - the executor implementation itself
  - exports the tool definitions and the function that handles a Texty tool call
- `index.html`
  - the local browser UI shown at `http://localhost:8787`
- `texty.json`
  - example manifest shape for this executor

## Clean Executor Shape

If you only want to see what the executor API looks like, start with:

- `examples/minimal-executor/executor.mjs`

The main exported function is:

```js
executeToolCall({ payload, defaultUserId })
```

Where `payload` is the request Texty sends to `POST /tools/execute`.

For this example, the server route is intentionally thin and just does:

```js
const result = executeToolCall({
  payload,
  defaultUserId,
});
```

That keeps the executor example readable without mixing business logic into the HTTP handler.

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

It listens on:

```text
http://localhost:8787
```

If you open that address in your browser, you will see:

- a simple message box
- the assistant transcript
- a todo list sidebar
- optional debug JSON

## Local Texty Config

Point local Texty at this executor:

```shell
TEXTY_EXECUTOR_CONFIG='{"demo_executor":{"token":"dev-token","baseUrl":"http://localhost:8787"}}'
```

You do not need to manually create `demo_executor` or `demo_user` first.
Texty creates the demo provider-user context on first sync or input.

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
        "tool_name": "todos.add",
        "description": "Add one item to the user'\''s visible todo list. Use this only when the user clearly asks to add, capture, or remember a task. The todo field should contain only the task text itself.",
        "input_schema": {
          "type": "object",
          "properties": {
            "todo": {
              "type": "string",
              "description": "Only the todo text, for example buy dog food. Do not include phrases like add to my todo list."
            }
          },
          "required": ["todo"]
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
      "text": "Add buy dog food to my todo list"
    },
    "channel": {
      "type": "web",
      "id": "local-browser"
    }
  }'
```

Texty should decide to call `todos.add`, and the executor should return a completed result with the updated todo list.

## Browser Demo

Once the server is running, open:

```text
http://localhost:8787
```

Try messages like:

- `add buy dog food to my todo list`
- `remember to email the landlord`
- `what should I cook for dinner?`

The first two should usually trigger the tool and update the visible list.
The last one should usually stay ordinary conversation.

## What Happens Next

After you send a message:

1. Texty receives the user input.
2. Texty decides whether a tool should run.
3. If needed, Texty sends `POST /tools/execute` to your local executor.
4. Your executor updates the todo list and returns structured JSON.
5. Texty turns that result into the assistant reply.
6. The browser shows the updated todo list state.

That is the basic integration loop.

## How To Adapt It

Once you understand the example, the normal next step is:

- keep the same route shape in `server.mjs`
- keep the same token check
- replace the implementation inside `executor.mjs`
- replace `todos.add` with your own tool
- replace the in-memory todo update with your real side effect

Examples:

- create a task in a real task system
- update a spreadsheet
- create a record
- run a workflow
