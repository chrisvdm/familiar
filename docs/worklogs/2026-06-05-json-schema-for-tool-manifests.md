# JSON Schema for Tool Manifests

## Summary

Published `packages/sdk/schema/familiar.tools.schema.json` — a machine-readable JSON Schema for `familiar.tools.json` files. Agents can now validate their tool manifests before syncing instead of failing late with opaque errors.

## Motivation

Issue #21. AI agents generating `familiar.tools.json` frequently hallucinate field names (`toolName` vs `tool_name`, `inputSchema` vs `input_schema`) or omit required fields. Without a schema, these errors surface only at sync time with cryptic messages. A published schema lets agents validate locally and fail fast with clear field-level diagnostics.

## Schema location

```
packages/sdk/schema/familiar.tools.schema.json
```

Bundled with the SDK npm package (added to `files` in `package.json`).

## Schema highlights

- `$schema`: JSON Schema Draft 07
- Root type: `array` of tool objects
- Required fields per tool: `tool_name`, `description`, `input_schema`
- `tool_name` pattern: `^[a-zA-Z0-9_.-]+$` with 64-char max
- `input_mode` enum: `["processed", "raw"]`
- `status` enum: `["active", "disabled"]`
- `base_url` format: `uri`

## Changes

- `packages/sdk/schema/familiar.tools.schema.json` — new schema file
- `packages/sdk/package.json` — added `schema/` to `files` array so it's included in npm publish
- `packages/sdk/README.md` — added "Tool manifest schema" section with usage example
