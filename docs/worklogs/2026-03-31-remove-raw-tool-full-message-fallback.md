# 2026-03-31 Remove Raw Tool Full Message Fallback

## Context

After switching raw tools to an AI-first normalization path, the non-shortcut flow still had a fallback that could re-derive raw payloads from the full user message when no extracted string argument was present.

## Change

- removed the normal raw-tool fallback that sanitized the full message into the raw field
- removed the matching `raw_input_text` fallback derived from the full message

## Result

- normal raw-tool execution now depends on the AI-extracted raw argument instead of competing with whole-message heuristics
- if the model does not produce a usable raw argument, the system keeps the missing/incomplete state instead of guessing from the full message
