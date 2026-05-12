# Security Audit: Demo Debug/Reset Auth (#38)

## Issue
Built-in demo sandbox debug and reset endpoints require no authentication:
```
GET /sandbox/demo-executor/debug
GET /sandbox/async-countdown/debug
GET /sandbox/pinned-tool/debug
POST /sandbox/demo-executor/reset
POST /sandbox/async-countdown/reset
POST /sandbox/pinned-tool/reset
```

## Fix
Restrict debug/reset endpoints to non-production environments only.

## UX / Agent Impact
None for production users. Demo sandboxes are for local development.

## Progress
- [ ] Add env check to debug/reset routes
- [ ] Commit