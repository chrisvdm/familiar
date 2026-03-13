# 2026-03-13 Single-Pane Command Chat

## Scope

- Replace the visible thread-management UI with a single-pane chat interface.
- Move thread operations into inline commands such as `:thread`, `:private`, and `:threads`.
- Keep the existing thread, memory, and web-chat behavior underneath the new command layer.

## Completed

- Reworked the web chat into a single-pane layout with a compact current-thread header instead of a thread sidebar.
- Added an inline command interpreter in the chat client for:
  - `:help`
  - `:current`
  - `:threads`
  - `:thread [initial message]`
  - `:private [initial message]`
  - `:switch [thread id]`
  - `:rename [thread id] [new title]`
  - `:delete [thread id]`
- Reused the existing server-side thread actions instead of introducing a second thread-management path.
- Rendered command results back into the chat log as assistant-style notices so thread management stays inside the same conversation surface.
- Extracted command grammar into `src/app/chat/conversation.commands.ts` and command execution into `src/app/chat/conversation.engine.ts`, so the web UI is now a thinner adapter over reusable conversation logic.

## Notes

- Private threads still use local thread memory and bypass global memory.
- Thread ids are shown in short form in command output, while full ids continue to be used internally.
