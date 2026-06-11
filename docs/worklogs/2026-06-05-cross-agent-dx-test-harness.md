# Cross-Agent DX Test Harness

## Summary

Added `tests/agent-dx/` — a reproducible benchmark for measuring how easily AI coding agents (Claude Code, Codex, etc.) can build a familiar integration from scratch.

## Motivation

Issue #26. We had anecdotal evidence that agents could build integrations, but no systematic way to measure friction. This harness gives a standard challenge, success criteria, and scoring rubric.

## Files

- `tests/agent-dx/README.md` — challenge description, success criteria, constraints, scoring rubric
- `tests/agent-dx/weather-executor-template.ts` — minimal reference implementation of a working executor
- `tests/agent-dx/verify.ts` — verification script that checks account, integration, tools, and end-to-end flow

## The Challenge

Build a `weather.get` tool and connect it to familiar. Success means:
1. Account created with valid token
2. Tool synced with valid JSON Schema
3. Executor reachable by familiar
4. "What's the weather in Paris?" returns a non-error response

## Scoring

| Metric | How to measure |
|--------|---------------|
| Time to first sync | Wall-clock time from start to `tools/sync` returning 200 |
| API calls made | Count of HTTP requests to familiar |
| Human interventions | Times agent asks for help |
| End-to-end success | Does the weather query work? |
| Retry loops | Times agent repeats the same failed action |

## Known Friction Points

The README explicitly calls out common agent failure modes:
- `tool_name` vs `toolName` confusion (API snake_case vs SDK camelCase)
- Forgetting `base_url` or `ai_api_key`
- Not understanding executor webhook payload shape
- Trying to use `familiar portal` without cloudflared
