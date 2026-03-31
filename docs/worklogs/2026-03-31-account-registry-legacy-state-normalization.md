# 2026-03-31 Account Registry Legacy State Normalization

- fixed a hosted compatibility bug in the account registry Durable Object for older stored account state
- normalized legacy registry state on load so missing `integrations` data no longer crashes the new hosted integration config endpoints
- added a regression test for the legacy registry shape

Result:

- `GET /api/v1/integration` and `PATCH /api/v1/integration` can now work against older hosted accounts created before per-integration config storage was added
