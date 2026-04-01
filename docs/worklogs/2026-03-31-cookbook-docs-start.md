# 2026-03-31 Cookbook Docs Start

## Context

The docs explained the API primitives, but there was no example-first section for common integration patterns. That made practical setup questions harder than they needed to be, especially for channel bridges.

## Change

- added a new `cookbook` docs page
- added the first recipe for receiving Discord mentions and forwarding them into Familiar
- linked the cookbook from the docs overview
- grouped cookbook recipes under the top-level cookbook page in the docs sidebar
- kept cookbook page section anchors above recipe links when the cookbook group is active

## Result

- the docs now have a dedicated place for implementation recipes
- recipe pages appear visually nested under `Cookbook` in the sidebar instead of as top-level docs pages
- the first cookbook entry makes the inbound Discord bridge flow explicit:
  - use `POST /api/v1/conversation/input`
  - do not use `POST /api/v1/webhooks/executor` for inbound chat
