# Contributing to familiar

Thanks for your interest in familiar.

## Quick Start

```bash
npm install
npm run dev      # local dev server
npm test         # run all tests
npm run check    # type check
npm run lint     # lint check
```

## For AI Coding Agents

If you are an AI agent or coding companion contributing to this repo, read these files **before** making changes:

1. [`AGENTS.md`](./AGENTS.md) — project structure, conventions, and build steps
2. [`docs/blueprints/developer-ai-guidelines.md`](./docs/blueprints/developer-ai-guidelines.md) — rules for AI coding sessions
3. [`docs/blueprints/architecture-foundations.md`](./docs/blueprints/architecture-foundations.md) — identity, storage, and memory policy

### Do Not

- Refactor files over 500 lines without opening an issue first
- Change LLM prompt text without running tests
- Add new dependencies without explicit justification
- Modify Durable Object class definitions in `wrangler.jsonc`
- Remove `.ts` extensions from imports (this project uses ESM with `allowImportingTsExtensions`)
- Change the factory pattern in `provider.decision.ts` or `ai-client.ts`
- Import `cloudflare:workers` into testable modules (see `src/app/provider/architecture.test.ts`)

### Always

- Run `npm test` before committing
- Run `npm run check` before committing
- Update `AGENTS.md` if you change conventions or architecture
- Update relevant docs in `docs/blueprints/` if you change behavior

## Module Boundaries

Some modules must remain testable in Node.js without the Cloudflare Workers runtime:

| Module | Must not import |
|--------|-----------------|
| `src/app/provider/ai-client.ts` | `cloudflare:workers` |
| `src/app/provider/provider.decision.ts` | `cloudflare:workers` |
| `src/app/provider/provider.logic.ts` | `cloudflare:workers` |
| `src/app/provider/provider.http.ts` | `cloudflare:workers` |

These rules are enforced by `src/app/provider/architecture.test.ts`.

## Pull Request Checklist

- [ ] Tests pass (`npm test`)
- [ ] Type check passes (`npm run check`)
- [ ] Lint passes (`npm run lint`)
- [ ] Docs updated if behavior changed
