# Texty Conversation Lifecycle

## Why This Document Exists

Texty is meant to be the system that manages a conversation from start to finish.

That means a single user message can lead to different outcomes:

- a direct answer
- a follow-up question
- a tool execution request
- a memory update
- a private-thread-only exchange

This document describes that lifecycle clearly so the system behavior is understandable before every API and runtime detail is implemented.

## One-Sentence Summary

Texty receives input, resolves the right conversation context, decides what kind of response is needed, performs the required work, and stores the result.

## Core Inputs

Texty should be able to accept input from:

- web chat
- messaging channels
- email
- voice-note transcripts
- image-derived text context

At the conversation layer, those should all become one normalized input shape.

Example:

```json
{
  "provider_id": "provider_a",
  "user_id": "user_123",
  "thread_id": "thread_abc",
  "input": {
    "kind": "text",
    "text": "Update the client spreadsheet"
  },
  "timezone": "Africa/Johannesburg"
}
```

## Lifecycle Stages

Every turn should move through the same broad stages.

### 1. Receive input

Texty receives:

- authenticated provider context
- user context
- channel or surface context
- raw input payload
- optional thread hint

### 2. Normalize input

Texty converts the incoming payload into one internal format.

Examples:

- plain text stays text
- a voice note becomes text plus metadata
- an image becomes extracted text or a provider-supplied image summary

### 3. Resolve identity and thread

Texty determines:

- which provider is making the request
- which user the request belongs to
- which channel the user is speaking through
- which thread to use

Thread resolution should follow this rule:

- if `thread_id` is supplied, use it
- if `thread_id` is not supplied, look at the most recent thread for that channel
- if the new input clearly fits that recent channel thread, continue it
- otherwise infer a better thread or start a new one

This means channel continuity is local to the channel, while memory continuity may still exist at the user level according to policy.

### 4. Load conversation context

Texty loads:

- recent thread messages
- thread-local memory
- shared memory allowed by policy
- synced allowed tools
- channel-local recent-thread context
- current date, time, and timezone context

If the thread is private:

- shared memory must not be loaded
- shared-memory writes must be disabled for this thread

### 5. Classify the turn

Texty decides what kind of turn this is.

At minimum:

- command
- direct answer
- clarification needed
- tool call

This is the core decision point.

### 6. Produce the next action

Depending on the classification, Texty does one of the following:

- execute a deterministic command
- answer directly
- ask a follow-up question
- call a provider tool

### 7. Persist transcript and memory

After the turn completes, Texty stores:

- the user message
- the assistant reply or command notice
- updated thread memory
- updated shared memory if allowed

### 8. Return the user-facing result

Texty returns:

- the message(s) to display
- the active thread id
- any updated thread metadata
- any command result or tool result summary

## Main Turn Types

### Direct answer

This path is used when Texty can respond without calling an external tool.

Flow:

1. user sends a message
2. Texty loads thread and memory context
3. Texty answers directly
4. Texty stores the exchange

Example:

- user: `What do you remember about my travel plans?`
- Texty answers from stored context

### Clarification

This path is used when the request is understandable but incomplete.

Flow:

1. user sends a message
2. Texty identifies missing information
3. Texty asks a follow-up question
4. Texty stores that follow-up as part of the thread

Example:

- user: `Update the project sheet`
- Texty: `Which sheet do you mean?`

### Tool call

This path is used when the user is asking for work to be done by an external system.

Flow:

1. user sends a request
2. Texty loads context and allowed tools
3. Texty decides which tool should run
4. Texty extracts arguments
5. Texty calls the provider
6. the provider returns a structured result
7. Texty explains that result back to the user
8. Texty stores the exchange

### Command

This path is used for deterministic conversation-control actions.

Examples:

- `:help`
- `:threads`
- `:thread`
- `:switch`
- `:rename`
- `:delete`

Commands should not require a model call unless there is a strong reason.

## Private Thread Lifecycle

Private threads follow the same high-level lifecycle, but the memory rules are stricter.

Private thread rules:

- the thread still has its own local transcript
- the thread may still use its own local thread memory
- shared memory must not be read
- shared memory must not be written
- the thread must not contribute summary nodes to shared memory

So a private thread is still a real conversation thread, but it is isolated from shared memory behavior.

## External Context Lifecycle

Some providers may want Texty to use external context instead of Texty-managed long-term memory.

In that case, the lifecycle changes slightly:

1. provider sends external retrieved context with the request
2. Texty uses that context for the current turn
3. Texty does not automatically treat that external context as Texty-owned durable memory

This keeps external retrieval and Texty-managed memory separate.

## Memory Behavior in the Lifecycle

Memory should be understood in two parts:

### Memory capture

Normal conversations are captured into memory by default.

Private threads are the exception.

### Memory usage

Texty may retrieve:

- thread-local memory
- shared memory
- external context

Which of those are allowed depends on policy.

## Channel-Linked Identity

Texty should treat channels as linked identities for one provider/user pair, not as separate users.

That means:

- the provider identifies the user
- the channel identifies where the user is speaking from
- the thread identifies which conversation is being continued

So one user may talk to Texty through:

- web chat
- email
- messaging

But those channels may still maintain different recent-thread continuity.

This lets Texty support both:

- shared memory for the same person
- separate conversation flow per channel

## Current vs Intended State

### Current state

Today, Texty's runtime still depends heavily on browser-session state and web-driven flows.

It already has:

- thread history
- thread-local memory
- browser-session-scoped global memory
- unified command/message handling

### Intended state

Texty should expose the same lifecycle through a provider-facing API, independent of the web interface.

The web client should become only one front end for this lifecycle, not the place where the lifecycle logic lives.

## Short Version

Every conversation turn in Texty should:

1. identify the provider, user, and thread
2. load the right context
3. decide whether to answer, clarify, or act
4. store the result
5. return a clean user-facing reply
