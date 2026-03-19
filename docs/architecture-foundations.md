# Texty Architecture Foundations

## Why This Document Exists

Texty is no longer just a browser chat app.

It is becoming a reusable conversational service that can sit in front of multiple execution systems such as:

- Scarymonster
- Kindling
- future provider systems

That makes three topics especially important to define clearly:

1. identity
2. storage
3. memory policy

This document is the current reference for those decisions.

## One-Sentence Goal

Texty should become a reusable conversational control layer that sits in front of many different execution providers.

That means:

- Texty manages the conversation
- providers perform the work

## Core Roles

### Texty

Texty is the conversation layer.

It should own:

- threads
- transcript history
- user-facing responses
- multimodal input normalization
- memory retrieval and storage
- current-turn reasoning
- clarification loops
- command handling
- tool orchestration

Texty should not own provider-specific business workflows.

### Provider

A provider is an external system that exposes capabilities to Texty.

Examples:

- Scarymonster
- Kindling

A provider should own:

- tool definitions
- workflow definitions
- side effects
- domain-specific validation
- execution logs

### User

The user is the human using the provider.

Examples:

- Chris using Scarymonster
- Sam using Kindling

The provider is not the user.

The provider is the system.
The user is the person.

## Identity Model

### `provider_id`

`provider_id` identifies the external execution system.

Examples:

- `scarymonster`
- `kindling`

Its purpose is to:

- route execution to the correct provider
- namespace tools
- separate configuration and sync state per provider
- support multiple providers inside one Texty deployment

### `user_id`

`user_id` identifies the human within the provider.

Examples:

- `chris_123`
- `sam_42`

`user_id` is provider-relative unless a higher-level shared identity is introduced later.

That means this is valid:

- `provider_id = scarymonster`
- `user_id = chris_123`

and this is also valid:

- `provider_id = kindling`
- `user_id = chris_123`

Those may or may not refer to the same human in real life. Texty should not assume they are shared unless explicitly configured.

### One provider can have many users

Yes.

That is the normal case.

Examples:

- Scarymonster may have thousands of users
- Kindling may have thousands of users

Each user may have:

- different threads
- different memory policy
- different allowed tools

## Storage Model

Texty should eventually store data around four main entities.

### 1. Thread

A thread is one conversation.

It should contain:

- transcript/messages
- thread-local memory
- title
- metadata

Recommended key:

- `thread_id`

### 2. User conversation context

This is the user-level record used by Texty.

It should contain:

- provider/user identity
- selected model preferences
- allowed tool catalog
- memory policy
- default behavior preferences

Recommended key:

- `(provider_id, user_id)`

### 3. Global memory

This is durable memory beyond one thread.

It should contain:

- identity facts
- family facts
- preferences
- work facts
- thread summary index

This should not automatically be global across all providers.

### 4. Tool access / provider sync state

This is the user-specific provider data that Texty needs in order to reason over tools.

It should contain:

- synced tools
- schemas
- policies
- provider configuration metadata

## Current Implementation vs Intended Implementation

### Current implementation

Today, Texty is still browser-session scoped.

That means:

- each thread transcript is stored in a chat Durable Object
- browser session state stores:
  - active thread
  - thread summaries
  - global memory
  - selected model

So current global memory is effectively scoped to a browser session, not yet to a real provider/user identity.

### Intended implementation

For the provider model, global memory should be scoped according to an explicit memory policy, not to a browser cookie.

That is the direction this document defines.

## Memory Policy

Memory must be configurable.

This is important because different providers want different behavior:

- Kindling may want no durable memory at all
- Scarymonster may want strong long-term continuity
- some users may want their own external RAG instead of Texty-managed memory

So Texty should not force one memory model on every provider.

Texty should support multiple memory modes and enforce them consistently.

## Recommended Memory Modes

### `none`

No durable memory.

Use only:

- the current request
- current prompt context
- maybe recent thread messages for rendering or immediate turn continuity

Use this when:

- the provider wants stateless behavior
- the user opts out of memory
- memory would be harmful to the task

Example:

- Kindling running isolated app-building sessions

### `thread`

Memory exists only inside the current thread.

Use this when:

- continuity inside a thread is useful
- cross-thread memory is not wanted

This allows:

- thread summary
- thread facts
- thread-local recall

But it does not allow:

- cross-thread personal memory

### `provider_user`

Memory is shared across all threads for one `(provider_id, user_id)` pair.

Use this when:

- the provider wants durable personal continuity
- memory should stay inside that provider boundary

Example:

- Scarymonster remembering a user’s family, preferences, and recurring operational context across all Scarymonster conversations

### `custom_scope`

Memory is shared using an explicit `memory_scope_id`.

Use this when:

- multiple providers should intentionally share memory
- or a provider wants several users/identities to share the same memory scope intentionally

Example:

- Scarymonster and another integration both point to `memory_scope_id = chris-global`

This is more flexible, but more dangerous.
It should be explicit and never assumed.

### `external`

Texty does not own the durable memory source.

Instead, the provider supplies retrieved context for the turn.

Texty may use that context for reasoning, but it should not automatically persist it as its own long-term memory unless policy explicitly allows it.

Use this when:

- the provider has its own RAG system
- the user wants provider-managed retrieval
- Texty should remain stateless with respect to long-term memory

Example:

- a provider sends retrieved project facts for the current turn from its own vector store

## How Memory Policy Should Be Applied

Each provider/user pair should have a memory configuration record.

Example:

```json
{
  "provider_id": "kindling",
  "user_id": "user_123",
  "memory_policy": {
    "mode": "none"
  }
}
```

Or:

```json
{
  "provider_id": "scarymonster",
  "user_id": "user_123",
  "memory_policy": {
    "mode": "provider_user"
  }
}
```

Or:

```json
{
  "provider_id": "scarymonster",
  "user_id": "user_123",
  "memory_policy": {
    "mode": "custom_scope",
    "memory_scope_id": "chris-global"
  }
}
```

Or:

```json
{
  "provider_id": "kindling",
  "user_id": "user_123",
  "memory_policy": {
    "mode": "external",
    "external_context_source": "provider"
  }
}
```

## Practical Meaning of Each Mode

### If mode is `none`

Texty should:

- not read durable memory
- not write durable memory
- only use immediate conversational context

### If mode is `thread`

Texty should:

- read/write thread memory
- not read/write shared global user memory

### If mode is `provider_user`

Texty should:

- read/write thread memory
- read/write provider-scoped global memory

### If mode is `custom_scope`

Texty should:

- read/write thread memory
- read/write memory under the explicit `memory_scope_id`

### If mode is `external`

Texty should:

- accept retrieved context from the provider
- use it in the prompt for the current turn
- avoid treating it as Texty-owned long-term memory unless explicitly configured to persist it

## Default Recommendation

Start with these defaults:

- Kindling: `none` or `thread`
- Scarymonster: `provider_user`

Only use `custom_scope` when there is a deliberate reason to share memory across systems.

Only use `external` when the provider truly wants to own retrieval itself.

## Why This Model Is Safer

This model avoids three common mistakes:

### 1. Assuming all providers want memory

They do not.

Some providers need memory.
Some providers are harmed by memory.

### 2. Assuming all user identities should share memory

They should not.

Memory sharing must be explicit.

### 3. Forcing Texty to own all retrieval

Sometimes the provider will have a better RAG layer.
Texty must allow that.

## Recommended Near-Term Implementation Path

1. Move from browser-session global memory to explicit provider/user identity.
2. Add a provider/user configuration record.
3. Store `memory_policy` there.
4. Route Texty memory retrieval and persistence through that policy.
5. Add `external` context support in the conversation input API.

## Source of Truth

This document defines the current intended architecture for:

- identity semantics
- storage semantics
- memory policy semantics

If future implementation differs, update this document rather than relying on implied behavior.
