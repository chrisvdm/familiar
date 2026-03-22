# 2026-03-22 README, Deploy, and Latency Work

## Goal

Clean up Texty's public-facing README, deploy the first live version to Cloudflare, and reduce response latency on the main conversation path.

## Public README Changes

- Rewrote `README.md` to behave more like a service landing page and less like an internal project file.
- Removed internal-project framing, implementation-heavy sections, and setup language that implied people should install Texty as a local app just to understand it.
- Focused the README on:
  - what Texty is
  - why it is useful
  - current status
  - a minimum integration path
  - API reference
  - a minimal example
- Added plain-English field descriptions for the API request bodies so a junior or time-constrained developer can understand what each field means.
- Added a simple diagram to show:
  - multiple channels going into Texty
  - Texty managing threads and memory
  - Texty handing off work to executors
- Clarified the conversation outcomes section so it explains:
  - direct reply
  - follow-up question
  - executor handoff
  rather than sounding like instructions to the reader.

## Example Integration

- Added a tiny canonical executor example in:
  - `examples/minimal-executor/README.md`
  - `examples/minimal-executor/server.mjs`
  - `examples/minimal-executor/texty.json`
- The example is intentionally small:
  - one `/tools/execute` route
  - one trivial tool
  - one token
  - one manifest-like config file
- This exists to reduce ambiguity for both human developers and AI-generated integrations.

## API Surface Changes

- Added `POST /api/v1/input` as a shorter public alias for the conversation endpoint.
- Kept the older conversation route working so existing behavior was not broken.
- Updated request-id and idempotency behavior to use the actual request path so both routes behave correctly.
- Preferred the new executor framing in runtime config by introducing:
  - `TEXTY_EXECUTOR_CONFIG`
  while still supporting:
  - `TEXTY_PROVIDER_CONFIG`

## Provider / Executor Hardening

- Hardened the executor callback path by extracting it into:
  - `src/app/provider/provider.execution.ts`
- Added tests in:
  - `src/app/provider/provider.execution.test.ts`
- The callback path now handles:
  - invalid JSON from executors
  - unreachable executors
  - invalid execution states
  - timeout failures
- Added rate limiting for tool sync, not just conversation input.
- Added route-level coverage for the tool-sync rate-limit response.

## Browser Session Cleanup

- Removed the browser-session hydration fallback that used to seed provider-backed state from browser-session thread and memory data.
- Browser session now acts as:
  - a local web identity anchor
  - a rendering/session bridge for the web client
- Provider/user/channel state remains the real source of truth.

## Deployment

- Prepared `wrangler.jsonc` for a real deployment by:
  - giving the worker a real name
  - setting the Cloudflare account id used for deployment
  - adding the Workers AI binding
- First live deployment completed successfully.
- Required Cloudflare secrets for deploy were:
  - `OPENROUTER_API_KEY`
  - `AUTH_SECRET_KEY`
- First live deploy URL:
  - `https://texty.chrsvdmrw.workers.dev`

## Latency Improvements

Two meaningful latency improvements were made:

### 1. Workers AI for routing

- Tool/intent routing now prefers Cloudflare Workers AI for the decision step.
- OpenRouter remains the fallback for routing if Workers AI is unavailable or errors.
- OpenRouter still handles the richer answer-generation path.
- Added support for:
  - `CLOUDFLARE_DECISION_MODEL`
- Default Workers AI routing model:
  - `@cf/meta/llama-3.1-8b-instruct-fast`

### 2. Deferred memory refresh

- The response path no longer waits for memory extraction/promotion after the assistant reply is ready.
- Existing memory retrieval for the current message remains synchronous.
- New memory refresh work now runs in the background using request-scoped `waitUntil`.
- This means:
  - the user gets a response sooner
  - memory still updates shortly after the response
  - the system preserves continuity without blocking the turn on memory extraction

## Verification

Across these slices:

- `npm test` passed
- `npm run types` passed
- `npm run build` passed

The only recurring build noise remained Wrangler's local log-file warning under:

- `~/Library/Preferences/.wrangler/logs/`

That warning did not block successful builds or deployment.
