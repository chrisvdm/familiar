# 2026-03-13 Sandbox Messenger

## Scope

- Add a `/sandbox/messenger` route to simulate a WhatsApp-style phone chat before building a real transport integration.
- Reuse the existing Texty thread/session backend instead of creating a disconnected mock.

## Completed

- Added a new route at `/sandbox/messenger`.
- Built a phone-sized messenger UI with:
  - WhatsApp-like top bar
  - threaded conversation body
  - mobile-style composer
  - lightweight conversation picker sheet
- Kept it connected to the same thread/session/model actions used by the main web chat.
- Allowed the sandbox to:
  - switch conversations
  - send messages
  - create a new private conversation
  - change the active model

## Notes

- This is a simulator route, not a real WhatsApp integration yet.
- The purpose is to test transport-like interaction patterns while still using the existing conversation engine and memory system.
