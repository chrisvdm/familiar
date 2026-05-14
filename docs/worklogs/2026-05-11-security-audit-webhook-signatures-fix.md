# Security Audit: Webhook Signature Verification (#42)

## Issue
Executor callback webhooks have no cryptographic signature verification.

## Fix Plan
1. Generate a `webhookSecret` per integration (stored in AccountRegistryDO)
2. When building the executor payload, compute HMAC-SHA256 of `integration_id + ":" + thread_id + ":" + execution_id`
3. Include signature in executor payload as `context.executor_result_webhook_signature`
4. Executor includes it as `X-Webhook-Signature` header in callback
5. Endpoint verifies HMAC before processing

## UX / Agent Impact
**Flagged**: Executors need to pass through the signature header. Old executors that don't will still work (signature is optional for now), but a warning will be logged.

## Progress
- [ ] Add webhookSecret to integration
- [ ] Generate on account creation
- [ ] Compute and include signature in payload
- [ ] Verify signature in executor callback endpoint
- [ ] Tests
- [ ] Commit