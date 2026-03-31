# 2026-03-31 Shortcuts Per Message Only

## Context

Shortcut syntax was persisting across messages through `activeToolShortcut` session state. That meant a tool mentioned in one message could continue to capture later unrelated messages, which was not the intended behavior.

## Change

- removed cross-message shortcut continuation from the conversation service
- cleared `activeToolShortcut` when appending thread state
- changed bare shortcut messages without payload into a clarification instead of a pinned-tool mode

## Result

- shortcut syntax now applies only to the message that contains it
- a previous tool mention no longer affects later unrelated messages
- users must include the payload in the same message, for example `@discord hello`
