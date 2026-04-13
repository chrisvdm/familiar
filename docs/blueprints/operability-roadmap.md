# familiar Operability Roadmap

## Purpose

This document defines the next major improvement area for familiar after the recent routing, memory-selection, and docs-alignment work.

The core conversation runtime is now coherent enough that the highest-value next step is not more routing sophistication.
It is making the system easier to inspect, explain, and trust in real-world integrations.

This roadmap is about:

- runtime observability
- operator-facing health and inspection
- clearer operational boundaries
- safer, more debuggable integration behavior

It is not a general admin-platform plan.
It is a focused plan for making the existing hosted runtime more operable.

## Current Assessment

familiar already has:

- request tracing through `request_id`
- normalized executor and delivery error handling
- routing reasoning surfaced on conversation responses
- account and integration base URL configuration
- a cleaner single-message shortcut model
- staged memory retrieval with cheaper-model selection

But the product still lacks first-class operational visibility.

Today, an operator still has to infer too much:

- whether the integration is configured correctly
- whether the executor is reachable
- whether delivery is reachable
- what routing decision was made on a given turn
- what memory was selected for that turn
- why a reply or tool call failed
- how channel and thread continuity was resolved

That makes the system harder to trust than it needs to be.

## Roadmap Principles

1. Prefer inspectability over more model cleverness.
2. Start with compact, high-signal runtime state rather than a large admin system.
3. Make one request traceable end-to-end.
4. Make failures visible in product surfaces, not only in logs.
5. Keep the canonical integration path boring and easy to reason about.

## Phase 1: Durable Runtime Events

Goal:

- make request and thread behavior inspectable after the fact

### Deliverables

- Add a durable provider event store instead of relying only on `console.info`.
- Store events at integration scope and thread scope.
- Add compact event records for:
  - `conversation.received`
  - `routing.decided`
  - `memory.selected`
  - `tool.execution.started`
  - `tool.execution.completed`
  - `tool.execution.failed`
  - `delivery.started`
  - `delivery.completed`
  - `delivery.failed`
  - `executor.callback.received`

### Event fields

Each event should include:

- `event_id`
- `occurred_at`
- `request_id`
- `integration_id`
- `user_id`
- `thread_id`
- `channel`
- `status`
- `code`
- compact `metadata`

### Notes

- Metadata should be intentionally bounded.
- Avoid storing full raw prompts or large payloads in the event stream by default.
- Event storage should support operator inspection, not become a second transcript store.

## Phase 2: Event Inspection APIs

Goal:

- expose operational history through the product itself

### Deliverables

- `GET /api/v1/integration/events`
- `GET /api/v1/threads/:thread_id/events`

### Filters

Support a compact filter set:

- `request_id`
- `status`
- `event`
- recent-first pagination

### Minimum operator use cases

- show all events for one failing request
- show the recent timeline for one thread
- show recent integration failures without parsing logs

## Phase 3: Integration Health

Goal:

- make integration readiness and reachability obvious before users hit failures

### Deliverables

- `GET /api/v1/integration/health`
- a health model for the current token-backed integration

### Health dimensions

- integration exists
- executor `base_url` configured
- tool execution path reachable or recently failing
- channel delivery path reachable or recently failing
- async callback path recently active or absent
- recent error counts across execution and delivery

### Health result shape

Health should distinguish:

- configuration state
- passive observed health
- active probe results if probes are added later

### Notes

- Start with passive health from observed events.
- Add active probes only where the probes are safe and low-noise.

## Phase 4: Debugging Surfaces

Goal:

- make familiar explain what it just tried and why

### Deliverables

- structured routing-inspection data
- structured execution-inspection data
- structured continuity-inspection data

### Routing inspection

Expose:

- selected tool or `none`
- confidence band
- routing reasoning summary
- whether shortcut syntax was involved
- whether clarification was required

### Memory inspection

Expose:

- retrieval mode
- candidate count
- selected memory entries
- fallback behavior if selector fails

### Continuity inspection

Expose:

- whether an existing thread was reused
- whether a new thread was created
- which channel identity was used
- a short continuity reason

## Phase 5: Minimal Operator UI

Goal:

- give hosted familiar a basic operational surface

### Deliverables

- integration status page
- recent event/failure list
- thread timeline inspector
- request lookup by `request_id`

### Minimum visible information

- current integration config summary
- recent failed executions
- recent failed deliveries
- recent callbacks
- recent routing decisions for inspected threads

### Non-goals

- full tenant admin
- broad replay controls
- bulk operations

## Phase 6: Safe Retry and Replay

Goal:

- reduce operational dead ends once visibility exists

### Deliverables

- safe delivery retry where idempotent
- request trace copy/export
- callback replay handling where the idempotency model is already safe

### Constraints

- do not add destructive replay behavior casually
- only expose controls where ownership and idempotency are already clear

## Public Contract Follow-Through

The observability work should inform a smaller public-contract cleanup pass.

That pass should:

- keep `POST /api/v1/conversation/input` as the primary inbound route
- keep `POST /api/v1/webhooks/executor` as callback-only
- continue reducing teaching emphasis on compatibility aliases
- sharpen the distinction between:
  - familiar
  - integration
  - executor
  - bridge/runtime

This should happen after the first observability surfaces exist, not before.

## Suggested Build Order

1. durable event model
2. event storage and write points
3. event read APIs
4. integration health endpoint
5. minimal operator UI
6. safe retry/replay controls
7. public docs follow-through

## Definition of Success

An operator should be able to answer these questions quickly without log archaeology:

- Did familiar receive the input?
- Which thread did it use and why?
- What memory did it select for the turn?
- Did it choose a tool or stay conversational?
- Did executor execution succeed?
- Did delivery succeed?
- If something failed, at what step did it fail?
- Is this integration healthy enough to trust right now?
