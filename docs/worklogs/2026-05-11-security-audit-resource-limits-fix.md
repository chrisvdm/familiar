# Security Audit: Resource Limits (#41)

## Issue
No caps on threads, messages, tools, or memory.

## Fix
Add generous hard limits:
- Max 500 threads per integration/user
- Max 5,000 messages per thread
- Max 200 tools per sync

## UX / Agent Impact
**Flagged**: Existing users with large histories may hit caps. Clear error messages provided. Pagination/chunking features (#51) will address this gracefully.

## Progress
- [ ] Add constants
- [ ] Enforce thread limit on create
- [ ] Enforce message limit on append
- [ ] Enforce tool limit on sync
- [ ] Tests
- [ ] Commit