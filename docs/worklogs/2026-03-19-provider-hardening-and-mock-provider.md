# 2026-03-19 Provider Hardening And Mock Provider

## Summary

Added the next provider-MVP hardening slice and a local mock execution endpoint.

## Changes

- Added a rolling per-provider/user conversation-input rate limit.
- Returned `429` responses with `Retry-After` details when the limit is hit.
- Preserved provider execution states beyond simple success/failure:
  - `completed`
  - `needs_clarification`
  - `accepted`
  - `in_progress`
  - `failed`
- Added a local mock execution route at `/sandbox/mock-provider/tools/execute`.
- Updated the README and provider API spec with:
  - local mock provider setup
  - execution-state behavior
  - rate-limit behavior

## Notes

- The mock provider is intended for local testing through `/sandbox/provider`.
- It allows end-to-end tool-call testing without needing an external provider service.
