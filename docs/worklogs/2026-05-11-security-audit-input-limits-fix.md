# Security Audit: Input Length Limits (#40)

## Issue
No max length on conversation `input.text`. Can send multi-megabyte payloads.

## Fix
Add a 500KB hard limit on `input.text`.

## UX / Agent Impact
**Flagged**: Large legitimate inputs (long document pastes) will be rejected. Future chunking feature (#50) will address this gracefully.

## Progress
- [ ] Add MAX_INPUT_TEXT_LENGTH constant
- [ ] Enforce in conversation endpoint
- [ ] Enforce in stream endpoint
- [ ] Enforce in simulate endpoint
- [ ] Tests
- [ ] Commit