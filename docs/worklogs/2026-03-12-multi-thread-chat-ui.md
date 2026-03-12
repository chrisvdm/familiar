# 2026-03-12 Multi-Thread Chat UI

## Scope

- Add explicit thread navigation to the chat experience.
- Move from a single implicit browser-session conversation to multiple session-backed threads.
- Keep the implementation lightweight and compatible with the existing Durable Object transcript store.

## Completed

- Extended browser session state to track `activeThreadId` plus a list of thread summaries.
- Added session normalization so older single-thread sessions migrate into the new thread shape.
- Updated server-side chat queries to create threads, switch threads, and keep thread summaries updated as messages are sent.
- Kept the existing chat Durable Object as the source of truth for each thread transcript.
- Reworked the sidebar into a thread list with a `New thread` action.
- Removed redundant chat-pane header chrome and the clear-thread action after UI review.
- Added top and bottom fades to the chat history container.
- Fixed the chat history area to a stable height so the page layout does not jump as threads grow.
- Reduced the overall border radius treatment across the chat UI.

## Current Architecture

- Browser session state now stores thread navigation metadata in `src/app/session/session.ts`.
- Middleware in `src/worker.tsx` bootstraps a first thread for new sessions and normalizes older session shapes.
- Thread transcript persistence remains in `src/app/chat/chat-session-do.ts` and `src/app/chat/chat.storage.ts`.
- Thread-aware server interactions live in `src/app/chat/chat.service.ts`.
- The server-rendered shell hydrates the active thread plus thread summaries in `src/app/pages/chat-shell.tsx`.
- Thread navigation and chat rendering live in `src/app/pages/chat.client.tsx`.

## Result

- Users can create and switch between multiple threads within the same browser session.
- Refresh persistence still works, but the experience is now explicitly thread-based instead of a single rolling conversation.
- The chat layout feels steadier and less cluttered.

## Follow-ups

- Decide whether thread rename, archive, or delete actions are needed once people accumulate more threads.
- Revisit the project brief if multi-thread chat becomes a stable product-level assumption rather than a UI step toward memory features.
- Add a thread-aware memory/retrieval layer later only if the current transcript-plus-summary approach becomes limiting.
