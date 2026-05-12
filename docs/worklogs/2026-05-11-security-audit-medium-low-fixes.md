# Security Audit: Medium and Low Severity Fixes

## Batch 1: Quick wins
- #44 CSP nonce missing on home page script
- #45 PBKDF2 iterations low (100k → 600k)
- #46 Hardcoded demo token
- #47 Contact submissions stored raw

## Batch 2: Low severity
- #48 No explicit CORS policy
- #49 CSP unsafe-eval

## Batch 3: Medium complexity
- #42 No webhook signature verification
- #43 No JSON Schema validation on tool arguments

## Progress
- [ ] Batch 1
- [ ] Batch 2
- [ ] Batch 3