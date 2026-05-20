# Concepts

The core model is intentionally small so humans and AI systems can understand it quickly.

## Executor

An executor is the code or service that *familiar* triggers after a tool has been selected.

In practice, that usually means:

- a script
- a small service
- a workflow runner
- a built tool behind an API

Examples:

- a script that updates a spreadsheet row
- a service that starts an import
- a workflow that sends an onboarding email
- a tool that creates or updates a record in another system

*familiar* owns routing and memory. The executor owns the side effects.

## Integration

An integration is one configured end-to-end *familiar* setup inside an account.

It is the full configuration for a specific app, bot, instance, or deployment.

An integration:

- has credentials
- defines which channels belong to it
- syncs tools
- identifies end users
- defines where executor calls are sent
- defines where channel messages are delivered

## Thread

A thread is one context-aware conversation record.

You can think of a thread as the place where one topic, task, or theme keeps its continuity.

That matters because *familiar* uses threads to keep the right context together instead of mixing unrelated conversations.

Threads give *familiar* a place to keep:

- the visible conversation
- thread-local memory

Examples:

- one thread for planning a trip
- one thread for working on a spreadsheet task
- one thread for debugging an integration issue

*familiar* also supports command-based thread management in the product today.

Examples include:

- `:threads`
- `:thread`
- `:switch`
- `:rename`
- `:delete`

### Private threads

A private thread keeps its own local transcript and memory. It does not write into shared user memory and does not contribute to cross-thread recall.

To create a private thread, call `POST /api/v1/threads` with `is_private: true` first, then pass the returned `thread_id` on the input call:

```json
POST /api/v1/threads
{
  "title": "Private session",
  "channel": { "type": "web", "id": "browser_session_abc" },
  "is_private": true
}
```

Then use the thread:

```json
POST /api/v1/input
{
  "input": { "kind": "text", "text": "..." },
  "channel": { "type": "web", "id": "browser_session_abc" },
  "thread_id": "<returned thread_id>"
}
```

## Tool shortcut

A user can make an explicit tool call with `@tool-name payload`.

*familiar* still processes the whole user message for thread context and memory.

If a message contains explicit tool invocations, each invoked tool receives only the text between:

- that invocation
- the next `@tool-name` invocation
- an explicit delimiter such as `@@` or `@end`
- or the end of the message

The shortcut only applies inside that same message.

It does not persist into later unrelated messages.

If a user sends bare `@tool-name` with no payload, *familiar* should ask for clarification instead of assuming later messages still belong to that tool.

Advanced shorthand:

- `@@` ends the current captured tool segment inside the same message
- `@end` does the same thing in a more readable form

This means the explicit-invocation rule is message-scoped, not thread-scoped.

## Memory policy

A memory policy controls how much stored memory *familiar* retrieves before each turn. It does not affect whether memory is captured — all non-private conversations are captured by default.

The policy is stored per user and defaults to `provider_user`.

| Mode | Retrieval behavior |
|---|---|
| `none` | No durable shared memory. Only the current request and thread-local context. |
| `thread` | Only thread-local memory. Cross-thread memory is blocked. |
| `provider_user` | **Default.** Full user-scoped global memory across all threads. |
| `custom_scope` | Retrieves memory under an explicit scope ID (for cross-integration sharing). |
| `external` | The integration supplies memory via `context.external_memories` in the input payload. *familiar* does not retrieve its own memory. |

Memory policy is set internally and cannot be changed through the public API today.

> [!NOTE]
> **Terminology**
>
> `account` is the owner of the *familiar* setup. It is the billing, workspace, or team boundary.
>
> `user_id` is the end-user identity inside one integration and stays stable across threads and channels for that user.
>
> `channel` is where the user is speaking from, such as web chat, email, or WhatsApp. It should include `channel.type` and `channel.id`, and may also include `channel.name`.
