# 2026-03-25 Implicit Single User MVP Surface

- removed `user_id` from the public MVP happy path in the docs
- updated the runtime so token-authenticated POST endpoints can default the user scope to the authenticated account id when `user_id` is omitted
- removed `user_id` from the main response payloads for conversation, tool sync, and executor callback paths
- motivation: until a real multi-user use case is being built, the token should be enough to represent the active setup and its current single-user scope
- also clarified the hosted docs so they read from the perspective of an external API user and documented the current CLI account-creation flow without assuming repo access
