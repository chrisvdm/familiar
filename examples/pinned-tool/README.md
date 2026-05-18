# Shortcut Tool Example

This example is a dedicated demo for the `@tool-name` flow.

It shows:

1. invoking a raw-input tool with `@notes.capture payload`
2. chaining another tool invocation later in the same message
3. using `@@` or `@end` to stop one captured segment before the next
4. keeping shortcut behavior scoped to the current message instead of carrying it into later messages

## Files

- `familiar.json`
  - sync manifest for two simple verbatim capture tools
- `executor.mjs`
  - in-memory capture logic for notes and ideas
- `server.mjs`
  - local transport server and familiar sync/input proxy
- `index.html`
  - browser UI for testing the shortcut flow

## Run It

From `examples/pinned-tool`:

```sh
TEXTY_EXECUTOR_TOKEN=dev-token \
TEXTY_BASE_URL=http://localhost:5173 \
TEXTY_INTEGRATION_ID=demo_pinned_tool \
PORT=8791 \
node server.mjs
```

Then open:

- `http://localhost:8791`

Live demo:

- [https://familiar.monster/sandbox/pinned-tool](https://familiar.monster/sandbox/pinned-tool)

## Try These Messages

- `@notes.capture Capture these meeting notes verbatim`
- `@notes.capture Capture these meeting notes verbatim @@ this trailing text stays ordinary conversation`
- `Please file these. @notes.capture We need to move the launch to next Tuesday @ideas.capture Package this as a premium onboarding offer`
- `@ideas.capture We should package this as a premium onboarding offer`

## Notes

- the tools accept one verbatim `message` string
- this example is meant to exercise the message-scoped shortcut rule, not LLM extraction quality
- bare `@tool-name` without payload should trigger clarification rather than carrying tool mode into a later message
- the example route path still uses `/sandbox/pinned-tool` for compatibility, even though the behavior is now shortcut-scoped rather than thread-pinned
