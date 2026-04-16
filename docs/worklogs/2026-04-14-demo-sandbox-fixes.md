# Demo Sandbox Fixes

## Investigation: Demo route bug and stale memory

We identified two problems with the sandbox demos during testing.

**Bug: countdown guard in todo demo route.** The `/sandbox/demo-executor/playground/texty` route had an `isCountdownRequest` guard copied from the countdown route. Any todo message (e.g. "add buy milk") hit the guard and returned "This demo only supports countdown requests." The fix was to remove the guard entirely — the todo demo handles any text input.

**Stale memory on `demo_user`.** The `demo_user` identity shared across all previous dev sessions had accumulated global memory facts (e.g. a stored `name: Chris`) from earlier test runs. When a new user typed "my name is John", the model tried to reconcile both names and produced a truncated nonsense reply. The root cause is that sandbox integrations share a persistent `ProviderUserContext` DO across sessions with no reset mechanism.

## Fix: Auto-reset on first message

We added a reset guard at the top of each sandbox playground `POST` handler. Before processing the first message, the handler loads the existing `ProviderUserContext`. If no threads exist, it calls `resetProviderUserContext` to wipe and recreate a clean context. This means:

- A user arriving at a sandbox for the first time gets a clean memory slate.
- A user who refreshes mid-conversation keeps their memory — threads already exist.
- Stale dev-session memory from previous contributors does not bleed into demo runs.

`resetProviderUserContext` was added to `provider.storage.ts`. It calls `createProviderUserContext` + `saveProviderUserContext` — a fresh context with empty global memory and no threads.

## Added: Debug and reset endpoints

To support inspection and manual clearing during development, we added the following routes to `provider.demo.routes.ts`. All are unauthenticated since the demo token is a server-side constant and these routes are sandboxed to demo integrations only.

### Debug endpoints

Return the full `ProviderUserContext` for the given sandbox user — `globalMemory`, `threads`, `allowedTools`, and `selectedModel`. Useful for verifying what facts are stored after a conversation.

```
GET /sandbox/demo-executor/debug[?user_id=<id>]
GET /sandbox/async-countdown/debug[?user_id=<id>]
GET /sandbox/pinned-tool/debug[?user_id=<id>]
```

`user_id` defaults to `demo_user` if omitted.

### Reset endpoints

Delete the `ProviderUserContext` for the given sandbox user. On the next message the auto-reset guard creates a fresh context. Use this to clear stale memory during development without restarting the worker.

```
POST /sandbox/demo-executor/reset[?user_id=<id>]
POST /sandbox/async-countdown/reset[?user_id=<id>]
POST /sandbox/pinned-tool/reset[?user_id=<id>]
```

`deleteProviderUserContext` was added to `provider.storage.ts` to back these routes.

## Added: input_request in observed

Each sandbox playground response now includes `observed.input_request` — the exact body sent to `handleProviderConversationInput`. This makes it straightforward to diff what was sent against what came back when debugging unexpected model responses.

## Fixed: New thread created per message

We observed that each message sent from the sandbox HTML pages created a new thread rather than continuing the previous one. The cause: the HTML clients were not tracking or sending the `thread_id` returned by familiar, so every request arrived without a thread ID and familiar created a fresh thread each time.

The fix was applied across all three sandboxes.

**Server side** — `buildInputBody`, `buildCountdownInputBody`, and `buildPinnedToolInputBody` each gained an optional `threadId` parameter. The playground `POST` handlers now extract `thread_id` from the request payload and pass it through. The `observed.input_request` in the response also reflects the thread ID so it appears in the debug view.

The pinned-tool response was missing `thread_id` at the top level (unlike demo-executor and async-countdown which expose it via `extractTask`). We added `thread_id: textyResult.thread_id ?? null` to the pinned-tool JSON response.

**Client side** — all three HTML files now:
- Initialise a `demoWindowState` object on `window.__textyDemoState` (shared across sandboxes if loaded together)
- Track `threadIdByIdentity` keyed by `{integrationId}::{userId}`
- Send `thread_id` from state on each request
- Store the returned `thread_id` after a successful response

The async-countdown HTML already stored `payload.task?.thread_id` in `latestRun.threadId` for the polling path. That was retained; we added the `demoWindowState` persistence layer on top so the thread persists across form submissions.

## Files changed

```
src/app/provider/provider.demo.routes.ts     — bug fix, auto-reset guard, debug/reset routes, input_request, thread_id threading
examples/minimal-executor/index.html         — thread_id tracking
examples/async-countdown/index.html          — thread_id tracking
examples/pinned-tool/index.html              — thread_id tracking
src/app/provider/provider.storage.ts         — resetProviderUserContext, deleteProviderUserContext
```
