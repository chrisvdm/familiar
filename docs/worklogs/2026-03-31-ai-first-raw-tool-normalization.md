# 2026-03-31 AI First Raw Tool Normalization

## Context

Raw-input tool execution was still re-deriving payload text from the full user message in multiple places. That made explicit invocation text like `@discord hello` leak through even when the model had already extracted a cleaner raw argument.

## Change

- raw-input normalization now prefers the AI-extracted string argument as the canonical payload
- explicit invocation cleanup is applied to that extracted string instead of blindly reusing the full message
- full-message sanitization remains only as a fallback when no usable raw argument was extracted
- pending confirmation and follow-up execution state now carries the normalized raw text forward

## Result

- raw tools follow an AI-first flow
- explicit wrappers like `@discord` are stripped from extracted raw arguments
- confirmation and follow-up executions preserve the same normalized raw payload instead of recomputing from the full message
