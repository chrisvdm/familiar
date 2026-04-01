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

*familiar* owns the conversation. The executor owns the side effects.

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

> [!NOTE]
> **Terminology**
>
> `account` is the owner of the *familiar* setup. It is the billing, workspace, or team boundary.
>
> `user_id` is the end-user identity inside one integration and stays stable across threads and channels for that user.
>
> `channel` is where the user is speaking from, such as web chat, email, or WhatsApp. It should include `channel.type` and `channel.id`, and may also include `channel.name`.
