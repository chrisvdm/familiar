# 2026-03-16 Command Core Entrypoint

## Scope

- Finish the next extraction step for the command-driven chat core.
- Add a single server-side conversation entry point so the web UI no longer has to orchestrate command execution itself.

## Completed

- Added internal thread/message action helpers inside `src/app/chat/chat.service.ts` for:
  - sending a message
  - selecting a thread
  - renaming a thread
  - deleting a thread
- Added `handleConversationInput(...)` as a single server-side entry point for raw input.
- Wired that entry point to the existing shared conversation parsing/execution modules.
- Updated the web chat client to submit raw input through the unified server-side entry point instead of composing command execution in the browser.

## Notes

- Hover actions and explicit thread UI controls still call the dedicated thread actions directly.
- The command-first path is now much closer to the intended architecture: the web client is becoming a thin adapter over a shared conversation core.
