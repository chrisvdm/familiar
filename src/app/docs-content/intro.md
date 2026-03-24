# _familiar_

_familiar_ is a hosted conversation layer for executable systems.

It sits between a person and the code that does the work. _familiar_ keeps the thread, remembers useful context, asks follow-up questions when something is missing, chooses the right tool, and sends structured input to the executor behind that tool.

## Why it exists

Without _familiar_, every app or workflow that wants a conversational interface has to rebuild the same pieces:

- thread handling
- context and memory
- clarification questions
- tool selection
- channel continuity
- user-facing replies

_familiar_ is meant to own those parts once so connected systems can focus on useful work.

## What it does

_familiar_ currently handles:

- normalized text input
- thread continuity
- channel-aware routing
- shared and thread-local memory
- clarification when required details are missing
- tool selection
- executor handoff
- async executor callbacks

## How the product works

Every user message follows the same shape:

1. _familiar_ receives normalized text.
2. _familiar_ resolves the correct thread and context.
3. _familiar_ decides whether to reply directly, ask a follow-up, or run a tool.
4. If work is needed, _familiar_ calls the executor for the selected tool.
5. _familiar_ stores the turn and returns the user-facing result.

## Input model

_familiar_ only receives text.

If your product supports voice notes or speech input, normalize that upstream before sending it to _familiar_. Large transcription blocks are fine as long as they arrive as plain `input.text`.

### Example input

```json
{
  "integration_id": "integration_a",
  "user_id": "user_123",
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

## Try the examples

The easiest way to understand the product is to open the live examples:

- Minimal Executor: the smallest working integration
- Async Countdown: a delayed executor result delivered later by webhook
- Pinned Tool: explicit tool calls that keep routing later text to the same tool
