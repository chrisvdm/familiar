# 2026-03-25 Payload First Thread Mutation Route

- added payload-first thread mutation support for `PATCH /api/v1/threads` and `DELETE /api/v1/threads`
- these routes now accept `thread_id` in the JSON body
- kept `/api/v1/threads/:thread_id` as a compatibility path
- motivation: the public API should keep important operational context in payloads instead of forcing it into the URL when the token-scoped model already carries most of the setup identity
