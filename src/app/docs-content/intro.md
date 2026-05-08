# *familiar*

*familiar* is a hosted tool router with memory.

It receives text from any channel, decides which tool to call, executes it via webhook, and remembers context across conversations — so the next message picks up where the last one left off.

## Why it exists

Without *familiar*, every system that wants to expose tools through text has to rebuild the same pieces:

- parsing intent from natural language
- choosing the right tool
- asking for missing arguments
- keeping thread context
- remembering facts across conversations
- routing results back to the right channel

*familiar* owns routing and memory so your executors can focus on execution.

## What it does

*familiar* currently handles:

- text input from any channel
- thread continuity
- channel-aware routing
- shared and thread-local memory
- clarification when required arguments are missing
- tool selection and routing
- webhook execution
- async executor callbacks

## How the product works

Every user message follows the same shape:

1. *familiar* receives normalized text.
2. *familiar* resolves the correct thread and context.
3. *familiar* decides whether to reply directly, ask a follow-up, or run a tool.
4. If work is needed, *familiar* calls the executor for the selected tool.
5. *familiar* stores the turn and returns the user-facing result.

## Input model

*familiar* only receives text.

If your product supports voice notes or speech input, normalize that upstream before sending it to *familiar*. Large transcription blocks are fine as long as they arrive as plain `input.text`.

### Example input

```json
{
  "integration_id": "integration_a",
  "input": {
    "kind": "text",
    "text": "Start the Acme import"
  },
  "channel": {
    "type": "web",
    "id": "browser_session_abc"
  }
}
```

## How to integrate

There are three ways to connect your system to *familiar*:

- **CLI** — use `familiar-cli` to set up an account, configure your integration, sync tools, and run a local tunnel during development
- **SDK** — use `familiar-sdk` to send input, sync tools, and manage integrations from your own JavaScript or TypeScript code
- **API** — call the HTTP API directly using any HTTP client

## Try the examples

The easiest way to understand the product is to open the live examples:

- Minimal Executor: the smallest working integration
- Async Countdown: a delayed executor result delivered later by webhook
- Shortcut Tool: explicit tool calls that apply only to the current message

## Learn by pattern

If you want example-first integration guidance instead of route-by-route reference docs, open the cookbook:

- [Cookbook](/docs/cookbook)
