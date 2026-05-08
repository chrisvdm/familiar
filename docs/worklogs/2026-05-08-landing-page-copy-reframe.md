# Worklog: Landing page copy reframe (#15)

## Date
2026-05-08

## Issue
- #15: Reframe familiar from "conversation layer" to "hosted tool router with memory"

## Scope
Rewrite all landing page and public-facing copy to match the new product positioning.

## Commits

### Commit 1: docs: reframe copy
- `README.md` — "hosted tool router with memory"
- `docs/project-brief.md` — updated purpose and product shape
- `docs/blueprints/market-positioning.md` — new positioning doc
- `docs/blueprints/provider-api-direction.md` — terminology updates
- All example READMEs and package READMEs

### Commit 2: feat(site): rewrite landing page copy
- Complete rewrite of `src/app/pages/home/index.tsx`
- New hero: "Your scripts, but you can text them"
- Added comparison table, pricing section, how-it-works flow
- Added supporting CSS to `src/app/pages/home/home.css`

### Commit 3: fix(site): update meta descriptions and add CSS cache-busting
- Updated `<meta name="description">` in `static-document.tsx` and `document.tsx`
- Added `?v=2` cache-busting to home.css import
- Restarted dev server to clear SSR caches

### Commit 4: feat(site): rewrite landing page to precise user copy
- Added explicit table headers to "What it fixes" (Without/With familiar)
- Restructured "How it works" with closing tagline at bottom
- Restructured "Pricing" as a table with Tier/Price headers
- Added dedicated "Get started" section
- Simplified docs footer to CLI · SDK · API · Executors · Cookbook
- Removed Examples section and hero sidebar

## Status
- [x] All copy updated to match new positioning
- [x] Landing page renders correctly
- [x] Meta descriptions updated
- [x] Types clean (3 pre-existing errors only)
- [x] Tests pass (147/148)

## Notes
User is planning a full UI redesign (colors, logos, favicons) next, so this copy is the structural/text foundation for that redesign.
