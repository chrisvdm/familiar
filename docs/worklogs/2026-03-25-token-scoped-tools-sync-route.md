# 2026-03-25 Token-Scoped Tools Sync Route

- updated the public MVP docs to teach `POST /api/v1/tools/sync` as the primary tool setup route
- kept `user_id` in the JSON payload instead of the URL for the main happy path
- left the older user-scoped and integration-scoped routes in place as compatibility paths
- motivation: for the current MVP, the URL should be as token-scoped and low-friction as possible while preserving the existing runtime behavior
