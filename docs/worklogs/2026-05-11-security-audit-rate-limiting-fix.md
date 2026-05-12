# Security Audit: Rate Limiting (#35, #36, #37)

## Issues
- #35: No rate limit on account creation (`POST /api/v1/accounts`, `POST /setup/create`)
- #36: No brute-force protection on dashboard login (`POST /dashboard/login`)
- #37: No rate limit on contact form (`POST /contact/submit`)

## Fix Plan
Add IP-based rate limiting via AccountRegistryDO:
1. Store `rateLimits: Record<string, string[]>` in registry state (key = action:ipHash)
2. Sliding window rate limiter (same pattern as conversation rate limits)
3. Limits:
   - Account creation: 5 per hour per IP
   - Login: 10 per 15 min per IP
   - Contact form: 3 per hour per IP

## UX / Agent Impact
None for legitimate users. Bots/scripts will be throttled with `Retry-After` header.

## Progress
- [ ] Add rateLimits to registry state
- [ ] Create shared rate limit check function
- [ ] Apply to account creation endpoint
- [ ] Apply to login endpoint
- [ ] Apply to contact form endpoint
- [ ] Tests
- [ ] Commit