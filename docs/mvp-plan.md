# familiar MVP Plan

## Purpose

This document defines the first implementation pass for familiar as a provider-aware conversation service.

It is intentionally narrower than the full long-term architecture.

The goal is to ship the first slice that proves:

- provider-authenticated access
- provider/user-scoped threads and memory
- channel-linked conversation continuity
- sync tool execution
- the current web UI using the same service path

## MVP Goals

The MVP should prove that familiar can:

1. authenticate a provider with an API token
2. accept a provider/user/channel conversation turn
3. resolve the right thread
4. load the right memory
5. answer directly, clarify, or call a tool
6. persist the result
7. expose the same behavior to the existing web UI

## Scope

### In scope

- provider API-token authentication
- provider/user-scoped conversation identity
- channel-linked thread resolution
- thread create/list/rename/delete
- conversation input endpoint
- tool sync endpoint
- sync tool execution callout
- private-thread enforcement
- provider/user-scoped shared memory
- web UI as a channel client of the same backend path

### Out of scope for MVP

- async job execution
- full multi-channel production integrations
- public user auth flows
- cross-provider shared memory
- streaming provider API responses
- advanced retention/export tooling
- full admin tooling

## MVP Identity Model

Each conversation turn must carry:

- `integration_id`
- `user_id`
- `channel.type`
- `channel.id`
- optional `thread_id`

Rules:

- integration authenticates with an API token
- user is the human within that integration
- channel is a linked identity for that user
- thread is the conversation record

## MVP Thread Resolution Rule

If `thread_id` is supplied:

- use it

If `thread_id` is not supplied:

- look up the most recent thread for that channel
- if the new input clearly fits that thread, continue it
- otherwise infer a better thread or start a new one

For the first implementation pass, "fits that thread" may use a simpler heuristic before a stronger inference model is added.

## MVP Memory Rule

### Capture

- all normal conversations are captured by default
- private threads are the exception

### Retrieval

Retrieval modes still apply:

- `none`
- `thread`
- `provider_user`
- `custom_scope`
- `external`

For MVP, the required supported retrieval modes are:

- `thread`
- `provider_user`
- `external`

The others can remain documented but unimplemented if needed.

## MVP Execution Model

The first pass should support sync execution only.

That means familiar calls a provider tool and waits for an immediate structured result.

Planned future execution states should still be documented now:

- `completed`
- `needs_clarification`
- `accepted`
- `in_progress`
- `failed`

For MVP, the runtime only needs to implement:

- `completed`
- `needs_clarification`
- `failed`

## MVP API Surface

Required endpoints:

- `POST /api/v1/integrations/:integration_id/users/:user_id/tools/sync`
- `POST /api/v1/conversation/input`
- `POST /api/v1/webhooks/executor`
- `POST /api/v1/threads`
- `GET /api/v1/integrations/:integration_id/users/:user_id/threads`
- `PATCH /api/v1/threads/:thread_id`
- `DELETE /api/v1/threads/:thread_id`

Optional but useful for debug:

- `GET /api/v1/integrations/:integration_id/users/:user_id/memory`
- `GET /api/v1/threads/:thread_id/memory`

## MVP Security Requirements

Minimum security for MVP:

- integration API-token authentication
- provider/user ownership checks
- thread ownership checks
- private-thread retrieval and capture enforcement
- request logging for write operations
- basic rate limiting on input and tool sync routes

## MVP Storage Shift

The current browser-session-scoped global memory needs to move toward provider/user scope.

For the first pass, the minimum required storage split is:

- thread transcript and thread memory keyed by thread ownership
- shared memory keyed by provider/user
- channel recent-thread continuity keyed by provider/user/channel

## MVP Web UI Rule

The web UI is not a provider.

It is one channel client.

For MVP, the web UI should use the same conversation entry path and thread rules as any other channel-facing surface, even if it still relies on local session behavior internally during the transition.

## MVP Build Order

1. Add provider API-token auth.
2. Introduce provider/user/channel request context.
3. Add provider-aware thread ownership and channel continuity records.
4. Move shared memory access behind provider/user scope.
5. Implement private-thread enforcement in the service layer.
6. Add tool sync endpoint.
7. Add conversation input endpoint.
8. Add sync provider tool execution callout.
9. Adapt the web UI to the same conversation path.
10. Add debug visibility for provider/user/channel resolution.

## Definition of Done

The MVP is successful when:

- a provider can authenticate
- a provider can sync tools for a user
- a provider can send a message for a user and channel
- familiar can continue the right thread or create a new one
- familiar can retrieve the right memory according to policy
- familiar can call a provider tool synchronously
- private threads remain isolated from shared memory
- the existing web UI can operate through the same core path
