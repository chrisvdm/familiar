# Security Audit: Webhook Signature Verification (#42)

## Issue
Executor callback webhooks have no cryptographic signature verification.

## Fix
1. Added `webhookSecret` to `FamiliarIntegrationConfig` — generated on account creation
2. Compute HMAC-SHA256 of `execution_id:thread_id` using `webhookSecret`
3. Include `executor_result_webhook_signature` in executor payload context
4. Executor result endpoint verifies `X-Webhook-Signature` header
5. Backward compatible: missing header logs warning (will become required in future)

## Commit
`41ba9cf` — security: webhook signatures (#42) and JSON Schema validation (#43)

## Status
✅ Closed
