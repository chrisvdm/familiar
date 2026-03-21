# 2026-03-19 Provider Idempotency

## Summary

Added basic idempotency support for provider write routes.

## Changes

- Added per-provider/user idempotency storage in provider context state.
- Added route-level support for `Idempotency-Key` on write operations:
  - tool sync
  - conversation input
  - thread create
  - thread rename
  - thread delete
- Added request fingerprinting so:
  - the same key with the same request replays the original response
  - the same key with a different request returns `409`
- Added pure idempotency helpers and automated tests.
- Updated the README and provider API spec to document idempotency behavior.

## Notes

- Replayed responses are marked with `X-Idempotent-Replay: true`.
- Stored idempotency entries are kept in the provider user context and trimmed over time.
