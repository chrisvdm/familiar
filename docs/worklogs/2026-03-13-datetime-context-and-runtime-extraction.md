# 2026-03-13 Datetime Context And Runtime Extraction

## Scope

- Always provide the AI with the current date, time, and timezone as explicit context.
- Continue extracting conversation logic out of the web client and into reusable shared modules.

## Completed

- Added a shared runtime prompt utility in `src/app/chat/conversation.runtime.ts` for:
  - default model constants
  - prompt-context building
  - current date/time system context
  - timezone normalization
- Updated chat replies to always include the current local date/time, timezone, and ISO timestamp as system context.
- Updated memory extraction calls to include the same date/time context so both answer generation and memory extraction reason from the same clock.
- Added `src/app/chat/conversation.input.ts` so raw input classification (`command` vs `message`) is no longer owned by the web client.
- Updated the web chat client to use the shared conversation-input path instead of duplicating the command-vs-message decision locally.

## Notes

- Timezone currently comes from Cloudflare request context when available and falls back to `UTC`.
- This extraction is an intermediate step toward a single conversation entry point that web, SMS, email, and WhatsApp adapters can all reuse.
