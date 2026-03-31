# 2026-03-31 Memory Selector Retrieval

## Context

The stored memory had become richer than the retrieval path.

Texty already had:

- thread facts
- shared structured memory
- derived facts
- a memory tree built from thread summaries
- recent conversation snippets

But the runtime was still relying mainly on heuristic matching to decide what memory to show the main model for a turn.

That created a mismatch:

- the memory was natural-language-heavy
- the recall logic was still mostly token and alias based

The result was that memory recall could feel obtuse or miss relevant context even when the right information had already been stored.

## Decision

Optimize for this default retrieval shape:

1. cheap AI reads the memory tree
2. expensive AI answers

More precisely, the familiar-owned memory path should be:

1. apply memory policy to decide the allowed scope
2. build a bounded candidate set from the allowed memory
3. use a cheaper model to select the smallest relevant subset for the current message
4. pass only that selected context to the larger answer or routing model

Heuristic retrieval remains the fallback if the selector model fails or returns nothing useful.

## Change

- made `buildMemoryContext` asynchronous so it can run a selector pass before prompt construction
- added a cheap-model memory-selector prompt in `src/app/chat/chat.memory.ts`
- built bounded candidate lists for:
  - thread facts
  - shared user facts
  - derived facts
  - memory-tree summaries
  - recent snippets
- kept heuristic matching as a fallback path when selector output is unavailable
- updated provider conversation handling to await the selected memory context before the main decision path runs
- updated internal docs to describe retrieval as a staged pipeline instead of a single load step

## Result

- retrieval is now optimized for semantic selection rather than only keyword overlap
- the expensive model no longer has to read the whole candidate memory set by default
- the internal docs now describe memory retrieval in the same terms as the runtime design

## Follow-ups

- add more direct tests around selector output shaping and fallback behavior
- decide whether external provider-supplied context should always go through the same selector pass when it is large
- consider separate env defaults for the selector model if the memory extraction model becomes too expensive for turn-time use
