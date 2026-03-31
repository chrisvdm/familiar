# 2026-03-31 Shortcut Prefix Sanitization For Processed Tools

## Context

Shortcut prefix stripping was only guaranteed for raw-input tools. If a tool like Discord was synced with the default processed input mode and a single string field, shortcut invocations such as `@discord hello` could still reach the executor as `@discord hello`.

## Change

- applied shortcut-originated prefix sanitization before argument mapping for all shortcut tool inputs
- kept the same sanitization path for raw-input tools and shortcut execution context
- added regression coverage for processed string-input tools

## Result

- `@discord hello` now resolves to `hello`
- `send to discord: hello` also resolves to `hello`
- raw and processed shortcut tools now share the same invocation-prefix stripping behavior
