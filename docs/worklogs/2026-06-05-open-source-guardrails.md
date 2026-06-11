# Open-Source Guardrails

## Summary

Added architecture tests, CI/CD, linting, and contribution guidelines to protect the codebase from accidental damage when opened to AI coding agents and external contributors.

## Changes

### Architecture Tests (`src/app/provider/architecture.test.ts`)

15 tests enforcing module boundaries:
- 5 modules banned from importing `cloudflare:workers`
- 10 modules must use `.ts` extensions on relative imports
- `createDecideConversationAction` and `AiClient` exports must exist
- `TOOL_DECISION_PROMPT` hash-locked (detects unauthorized prompt changes)
- Size limits on core modules to prevent re-bloating

### CI/CD (`.github/workflows/ci.yml`)

GitHub Actions workflow running on push/PR:
1. `npm run lint` (Biome)
2. `npm run check` (type-check)
3. `npm test` (Node.js test runner)

### Linting & Formatting (`biome.json`)

Biome 2.4.16 configured with strict rules:
- `noUnusedImports` — error
- `useImportType` — error  
- `noConsole` — warn (catches stray debug logs in production code)
- 2-space indent, double quotes, trailing commas, 100-char line width

Package scripts added: `lint`, `lint:fix`, `format`.

### CONTRIBUTING.md

Added "For AI Coding Agents" section with explicit rules:
- Read `AGENTS.md` before changes
- Do not refactor files >500 lines without an issue
- Do not change LLM prompts without tests
- Do not remove `.ts` extensions
- Always run `npm test` and `npm run check`

### CODEOWNERS (`.github/CODEOWNERS`)

Requires `@chris` review for changes to:
- `src/app/provider/`
- `src/app/chat/`
- `src/app/account/`
- `wrangler.jsonc`

## Rationale

The project is approaching open-source readiness. These guardrails make it safer for:
- AI coding agents (explicit do/don't rules)
- External contributors (automated checks catch common mistakes)
- Future maintainers (architecture tests prevent accidental coupling)
