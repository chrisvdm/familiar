# familiar Market Positioning

## Definition

`familiar` is a hosted tool router with memory.

It receives text from any channel, decides which tool to call, executes it via webhook, and remembers context across conversations — so the next message picks up where the last one left off.

## Problem

Teams can already execute work with tools like Zapier, n8n, internal APIs, and custom services.

What they usually do not have is solid tool routing in front of their execution layer:

- keeping track of threads over time
- deciding what context should persist
- asking follow-up questions when requests are incomplete
- choosing the right tool or workflow
- turning tool results back into clear user-facing replies
- maintaining continuity across channels

That gap is what `familiar` is for.

## Product Boundary

What `familiar` does:

- accepts user input
- manages threads and conversation history
- stores and retrieves memory according to policy
- asks for missing information before execution
- selects tools based on declared contracts
- sends structured requests to external systems
- turns structured results into conversational replies

What `familiar` does not do:

- replace Zapier, n8n, or your backend
- own your business logic
- act as a desktop agent
- act as a personal AI assistant
- be the system that performs every side effect itself

Plain version:

`familiar` handles routing and memory. Your existing systems handle the work.

## Target Users

Best-fit users:

- teams building app-specific copilots
- teams adding text-based tool routing to internal software
- founders building workflow-driven products with a chat layer
- agencies building custom AI systems for clients
- developers connecting multiple existing systems behind one interaction surface

Less ideal early users:

- people looking for a personal assistant product
- people looking for a no-code bot builder
- people wanting a full packaged agent runtime

## Competitor Framing

Against OpenClaw or MyClaw:

- OpenClaw is a packaged agent system.
- `familiar` is a building block for teams building their own systems.

Against Zapier or n8n:

- Zapier and n8n execute workflows.
- `familiar` adds routing and memory in front of those workflows.

Against Botpress:

- Botpress is primarily a bot platform.
- `familiar` is for teams that already have or want custom execution systems behind a text router.

Against LangGraph-style frameworks:

- LangGraph gives you primitives to build agent systems.
- `familiar` aims to provide a more opinionated conversation backend out of the box.

## Short Positioning

Default version:

`familiar` is a hosted tool router with memory.

It receives text from any channel, decides which tool to call, executes it via webhook, and remembers context across conversations — so the next message picks up where the last one left off.
