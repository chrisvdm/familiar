# familiar Developer AI Guidelines

## Purpose

This file captures repo-specific working rules for AI coding sessions and human contributors.

Update it when the team adopts a new standing convention, documentation rule, or implementation preference that should persist across tasks.

## Documentation Rules

- Create task-specific worklogs in `docs/worklogs/`.
- Name worklogs as `YYYY-MM-DD-task-name.md`.
- Use worklogs to capture scope, completed work, results, follow-ups, and notable constraints for a single task.
- Keep the project brief in `docs/project-brief.md` updated when the product direction or architecture materially changes.
- Do not use chat history as the only source of truth for project decisions.

## Product Rules

- Keep familiar focused on a strong core chat experience.
- Prefer minimal branding and tool-like UI over marketing-heavy page structure.
- Add major features like RAG, summaries, auth, or multi-device memory only when there is a clear need.
- Preserve the current expectation that refresh persistence works within a browser session.

## Architecture Rules

- Prefer RedwoodSDK-native patterns over custom infrastructure when RedwoodSDK already provides a documented approach.
- Keep browser session handling aligned with RedwoodSDK session conventions.
- Keep chat persistence concerns separate from browser session concerns.
- Treat Durable Objects as the source of truth for persisted chat history.
- Keep prompt-context trimming explicit and intentional rather than accidental.

## Change Management

- For each meaningful task, update or create a worklog in the same change.
- If a change affects long-lived project assumptions, update `docs/project-brief.md`.
- If a change creates a new standing convention, update this file too.
- Keep commits scoped to coherent tasks when practical.

## Current Conventions

- App name is `familiar`.
- Visible branding should stay minimal unless the product direction changes.
- Task worklogs are the running implementation log.
- The project brief is the stable high-level summary.
- This guidelines file is the stable repo-specific collaboration guide.

## Review Checklist

Before closing a substantial task, check whether the change should also update:

- `docs/worklogs/...`
- `docs/project-brief.md`
- `docs/developer-ai-guidelines.md`
- `README.md`

## When To Update This File

Update this file when any of the following become true:

- A repeated instruction keeps showing up across tasks.
- A repo convention changes.
- A documentation habit becomes mandatory.
- A product or architecture preference should be treated as standing guidance.
