# 2026-03-31 Raw Shortcut Raw Input Sanitization

## Context

Raw-input tools were sanitizing shortcut text into the structured tool arguments, but the execution context still forwarded the original message in `raw_input_text` for shortcut executions. That meant inputs like `@discord boo!` could still reach the executor as the full invocation string instead of just `boo!`.

## Change

- added `buildShortcutRawInputText()` in `src/app/provider/provider.logic.ts`
- used the shared helper in both shortcut execution paths in `src/app/provider/provider.service.ts`
- extended provider logic coverage for invocation-only phrases and sanitized raw shortcut context values

## Result

- `@discord boo!` now sends `boo!`
- `send to discord: hello` now sends `hello`
- invocation-only phrases like `send message to discord` sanitize to an empty raw payload instead of being forwarded verbatim
