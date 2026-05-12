# Security Audit: CLI Session Hijacking (#34)

## Issue
The CLI device-authorization flow is vulnerable to session hijacking:
1. Attacker creates a CLI session
2. Attacker sends victim a link: `/auth/cli?session=ATTACKER_SESSION_ID`
3. Victim clicks "Use this account"
4. Victim's browser calls the **unauthenticated** complete endpoint with their token
5. Attacker's CLI polls and receives the victim's token

## Fix Plan
Add a `completionSecret` to CLI sessions:
1. Generate a random secret when creating the session
2. Return it to the CLI in the create response
3. CLI passes it to the browser via URL query param
4. Browser includes it in the complete request
5. Server verifies the secret matches before storing the token

## UX / Agent Impact
**Flagged**: Old CLI versions that don't know about `completionSecret` will break — the complete endpoint will reject requests without a secret. Users need to upgrade their CLI. The CLI package should be republished.

## Progress
- [ ] Add completionSecret to FamiliarCliSession type
- [ ] Update DO createCliSession to generate secret
- [ ] Update DO completeCliSession to verify secret
- [ ] Update service layer
- [ ] Update endpoints
- [ ] Update CLI to pass secret in URL
- [ ] Update browser page to read and send secret
- [ ] Tests
- [ ] Commit