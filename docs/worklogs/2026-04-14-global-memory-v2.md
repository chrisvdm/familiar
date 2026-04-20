# Global Memory v2

## Context

This worklog covers the extraction quality pass and personality/style synthesis work that followed the demo sandbox fixes. The goal was to make global memory more accurate, more structured, and smarter about what gets stored per-turn vs. inferred over time.

## Investigated and fixed the "alice and" name storage bug

We traced the bug to `extractProfileFactsHeuristically`, a heuristic regex that split names on whitespace and matched "and" as a second word when input was "my name is alice and i want to dance". The fix was to remove the entire heuristic extraction function — we rely solely on the LLM extraction prompt for name facts.

## Redesigned GLOBAL_MEMORY_KEYS and extraction rules

We audited the valid key set and added missing identity keys: `age`, `nationality`, `language`, `employer`, `industry`, `relationship_status`, `goal`, `dietary`, `gender`, `pronouns`. We removed ambiguous keys (`interests`, `fears`, `preference`, `preferences`) in favour of their canonical singular forms.

We also added structured name keys: `first_name`, `last_name`, `nickname`.

## Fixed aspiration vs. current fact confusion

We observed the model storing `profession: dancer` with confidence 0.95 from "I want to be a dancer". A first fix (carve-out for aspiration verbs) was rejected as patchwork. We replaced it with a principled tense/mood routing rule:

- Reality (present/past tense): route to the most specific matching key
- Enjoyment/preference ("I like", "I enjoy"): route to `interest` or `likes`
- Aspiration/dream ("I want to be", "I'd like to"): route to `aspiration`

We added `aspiration` as a multi-value key and wired it into `preferences.aspirations`.

## Added name detection rules to extraction prompt

We added explicit rules for all name phrasing patterns: "my name is X" or "I am X" → `first_name` (or `name` if a full name); "my last name is X" → `last_name`; "call me X" → `nickname`. Values are the name only — no surrounding words or conjunctions.

## Added confidence calibration scale

We added an explicit four-point confidence scale to the extraction prompt:
- 0.95: stated explicitly and unambiguously
- 0.8: stated clearly but with some context-dependence
- 0.6: mentioned in passing or slightly indirect
- 0.4: uncertain or easily retracted

## Added personality and style buckets to GlobalMemory

The user asked whether personality traits could be inferred — e.g. "they are a handy person". We added three new `MemoryFactGroup` buckets to `GlobalMemory`:

- `personality`: inferred observable traits (practical, curious, methodical, direct, etc.)
- `style`: observable communication style (verbosity, tone, humor, format)
- `dynamic`: stable biography-worthy identity facts that don't fit profile keys (religion, sport, skill, etc.)

We agreed not to filter for positive traits — accurate observation is the goal.

## Designed background synthesis for personality and style

We discussed moving personality and style inference out of the per-turn extraction loop into a periodic background task. The rationale: per-turn inference on a single message is noisy and can store bad data. Synthesis over a larger window of messages produces more reliable trait assessments.

The design we settled on:

- `lastSynthesis` and `nextSynthesis` timestamps on `ProviderUserContext`
- Before each request, check if `nextSynthesis` has elapsed. If yes, run synthesis synchronously (awaited) before building the memory context — so the current turn already sees fresh results
- Synthesis interval: 24 hours
- Synthesis loads up to 3 recent threads × 40 messages, calls `synthesizeUserProfile`, and replaces the `personality` and `style` buckets entirely (the full picture is rebuilt each run)
- If synthesis fails, timestamps are still pushed forward to prevent retry storms
- Forced calibration: if the user explicitly asks for a behavioural/style analysis, synthesis runs immediately regardless of the interval

## Implemented synthesis pipeline

We implemented the full pipeline across four files.

`synthesizeUserProfile` in `chat.memory.ts`: takes recent messages and current globalMemory, runs a dedicated synthesis LLM call, rebuilds the personality and style buckets from scratch, and returns the updated GlobalMemory.

`runProfileSynthesis` in `provider.service.ts`: loads recent thread messages, calls `synthesizeUserProfile`, saves the updated context with new `lastSynthesis` and `nextSynthesis`.

`isSynthesisDue` and `isCalibrationRequest` helpers in `provider.service.ts`: check whether to trigger synthesis on a given turn.

Synthesis check wired into `handleProviderConversationInput`: runs after the initial context save, before memory retrieval, so the current turn sees fresh personality/style data.

`personality_observations` and `style_observations` removed from per-turn `refreshMemories` — synthesis is now the sole source of truth for those buckets.

## Files changed

```
src/app/chat/chat.memory.ts           — removed heuristic extraction, key cleanup, extraction rules, synthesizeUserProfile
src/app/chat/shared.ts                — personality/style/dynamic buckets, goals/dietary, new fact routing helpers
src/app/provider/provider.types.ts    — lastSynthesis/nextSynthesis on ProviderUserContext
src/app/provider/provider.storage.ts  — initialize and normalize lastSynthesis/nextSynthesis
src/app/provider/provider.service.ts  — runProfileSynthesis, isSynthesisDue, isCalibrationRequest, synthesis check in handler
src/app/provider/provider.endpoint.test-helpers.ts — lastSynthesis/nextSynthesis in test fixture
src/app/provider/provider.idempotency.test.ts      — lastSynthesis/nextSynthesis in test fixture
```

## Suggested verification

1. Start the dev server: `npm run dev`
2. Reset memory: `npm run memory reset demo_user`
3. Open the minimal-executor sandbox and send a few messages that reveal personality traits — e.g. methodical problem-solving, direct communication
4. Check debug output: `npm run memory debug demo_user` — `personality` and `style` should be empty (no per-turn extraction)
5. Force synthesis by asking "analyse my communication style" — check debug output again; `personality` and `style` should be populated
6. Send another message — synthesis should not re-run (check `nextSynthesis` in debug output is ~24h in the future)

## Fixed memory retrieval — removed buildSelfMemoryRecallReply

We traced the "I do not know your name yet." response to `buildSelfMemoryRecallReply`, a function that intercepted messages before the LLM using regex-gated heuristics (`isNameRecallQuery`, `shouldCheckSelfMemoryRecall`, `isPersonalMemoryDeclaration`). Two bugs compounded: `isPersonalMemoryDeclaration` had a `^` anchor that rejected messages with a greeting prefix ("Hello my name is alice"), and when no name was stored the function returned a hardcoded string instead of passing through to the LLM.

We removed `buildSelfMemoryRecallReply` entirely along with all its helpers and call sites. The LLM now handles all memory-informed responses using context injected by `buildMemoryContext`.

## Established hard rule: no NLP heuristics on user language

We identified that the root cause of multiple bugs across both extraction and retrieval was the same pattern: functions that used regex or verb lists to interpret what the user meant before the LLM saw the message. Each "shortcut" introduced edge cases worse than the problem it solved.

We established a hard rule: no regex, pattern matching, or heuristic functions that detect user intent from message content. The LLM handles natural language. Legitimate regex use is limited to structural parsing (empty check, exact tool name matching, JSON extraction, URL parsing).

This rule is recorded in the project memory and applies to all future work.

## Removed all dead code

Following the removal of `buildSelfMemoryRecallReply` and `extractIntroducedName`, we audited and removed all functions that had no remaining call sites:

- `parseSelfMemoryRecallResponse`, `classifySelfMemoryRecallIntent`
- `formatMemoryFactForReply`, `joinMemoryPhrases`, `getStoredName`
- `filterFactsForSelfMemoryFocus`, `dedupeReplyFacts`, `filterCanonicalSelfRecallFacts`
- `extractIntroducedName` (from `provider.logic.ts`) and its tests

455 lines removed. TypeScript confirmed clean.

## Added worklog verification tests

We established a convention: each worklog gets a test file named `<module>.<worklog-slug>.test.ts` with a comment linking back to the worklog doc. The worklog is not closeable until those tests pass.

We created `src/app/chat/chat.memory.global-memory-v2.test.ts` with 10 tests covering the worklog's original goals: lowercase name acceptance, greeting prefix handling, rejection of non-declared names, aspiration routing to `preferences.aspirations`, and `first_name`/`last_name`/`nickname` routing to `identity`. All pass.

## Filed out-of-scope discoveries as GitHub issues

Tasks discovered during this worklog that were out of scope were filed as `backlog` issues on the repo:

- [#1](https://github.com/chrisvdm/familiar/issues/1) Memory audit pass: staleness, gap fill, confidence decay
- [#2](https://github.com/chrisvdm/familiar/issues/2) Remove `getTodoHeuristicDecision`
- [#3](https://github.com/chrisvdm/familiar/issues/3) Remove `hasExplicitToolUseIntent` verb-list heuristic
- [#4](https://github.com/chrisvdm/familiar/issues/4) Composite interest extraction ("japanophile" type facts)
- [#5](https://github.com/chrisvdm/familiar/issues/5) E2E test harness with memory assertions and vector similarity response verification

## Future improvement: memory audit pass

We identified that the periodic synthesis should eventually be extended into a full memory audit — not just personality/style, but all stored facts. The audit would:

- **Staleness check**: scan recent conversations for evidence that contradicts a stored fact (e.g. a new location invalidates the old one) and return a diff of facts to remove or update.
- **Gap fill**: look for facts that should have been extracted but weren't — composite identity-level interests like "japanophile" (cultural interest + language learning + lifestyle mentions) are a known gap today.
- **Confidence decay**: optionally lower confidence on facts that haven't been reinforced in a long time.

The complication with extending audit to profile facts is that explicit declarations ("my name is X") should be trusted even when not repeated. The model would need to return a diff (remove/update specific keys) rather than a full rebuild. The synthesis infrastructure (`lastSynthesis`/`nextSynthesis`, `runProfileSynthesis`) is the right foundation to build this on.

## Verification surfaced two bugs

Manual verification against the demo sandbox revealed two failures.

### Bug 1: Synthesis never populates personality and style

Tracing the flow: on the first conversation turn after a memory reset, `nextSynthesis` is null so `isSynthesisDue` returns true and `runProfileSynthesis` fires. But the current message has not been saved yet at that point in the handler, so the loaded session has 0 messages. `synthesizeUserProfile` returns early (`userMessages.length < 3`) without producing any results — but `runProfileSynthesis` still advances `nextSynthesis` 24 hours forward.

All subsequent turns see `nextSynthesis` in the future and skip synthesis. The `isCalibrationRequest` function exists to force a re-run on demand, but it is a regex pattern matching natural language intent — a direct violation of the no-NLP-heuristics rule. It was also tested and found to match `"analyse my communication style"` but not `"analyze my communication style"` (US spelling), confirming fragility.

Root cause: timestamps advance even when synthesis aborted due to insufficient data, burning the synthesis slot on a no-op.

### Bug 2: Pet species not stored; LLM second-guesses when challenged

The user mentioned owning a goldfish named Albert. The memory stored `pet_name: Albert` correctly, but the species (goldfish) was not extracted — there is no `pet_type` key in the schema. On first mention the LLM recalled "goldfish" correctly because it was in the recent conversation context (last 3 exchanges). When challenged with "are you sure I have a pet goldfish?", the LLM looked at the stored memory, saw only `pet_name: Albert` with no species, and capitulated — apologising for an "assumption" and asking what kind of pet Albert is.

Additionally, `pet_name: Albert` appeared in both `family.pet_name` and `dynamic.pet_name` — a duplication caused by the fact landing in `dynamic` before the `family` routing path was in place.

## Refined direction after ideation

We discussed two approaches to the pet retrieval failure: fixing the thread keyword extraction, or changing how facts are stored (sentence-based: `pets: "has a pet goldfish named Albert"` vs atomic key-value pairs). We agreed:

- **Thread keywords are the right fix for now** — the goldfish failure was a retrieval failure, not a storage failure. The thread summarizer captured themes but missed entity mentions (names, animals, objects). If "goldfish" and "Albert" had been keywords, the retrieval system would have known to drill into that thread.
- **Sentence-based fact storage is worth exploring later** as a separate worklog — it would make complex entities more natural and reduce the need for keys like `pet_type`. Deferred to backlog.
- **Personality and style synthesis is not a priority** — the basics of fact storage and retrieval need to work first. The synthesis timing bug is deferred.

## RFC: Fix thread keyword extraction and dynamic bucket deduplication

### 2000ft view

The thread summarizer generates keywords that capture conversation themes but misses concrete entity mentions — names, animals, objects, places mentioned in passing. This means the AI retriever cannot surface relevant threads for entity-based queries ("do I have a pet?"). The fix is to update the thread summarization prompt to explicitly extract all named entities and concrete nouns as keywords alongside thematic keywords.

A secondary fix: `pet_name` is landing in both `family` and `dynamic` — a bucket duplication caused by the `dynamic` fallback catching keys that already have an explicit route. The `dynamic` fallback should only fire for keys with no other home.

### Behavior spec

GIVEN a user mentions "I have a pet goldfish named Albert" in a conversation  
WHEN the thread summary is generated  
THEN the keywords include "Albert", "goldfish", and "pet"

GIVEN thread keywords include "goldfish"  
WHEN the user later asks "do I have a pet goldfish?"  
THEN the retriever surfaces that thread and the LLM has context to answer confidently

GIVEN a fact with key `pet_name` is added to global memory  
WHEN `addFactToGlobalMemory` routes it  
THEN it lands in `family` only — not in `dynamic` as well

### Implementation breakdown

`[MODIFY] src/app/chat/chat.memory.ts`
- Update the thread summarization prompt to extract named entities and concrete nouns as keywords (names of people, places, animals, objects) in addition to thematic keywords

`[MODIFY] src/app/chat/shared.ts`
- Audit `addFactToGlobalMemory` dynamic fallback — ensure it only fires for keys not already handled by identity/work/family/preferences routes

### Deferred to backlog

- Personality/style synthesis timing fix — filed as part of ongoing synthesis work
- Sentence-based fact storage (`pets: "has a pet goldfish named Albert"`) — worth a dedicated worklog when basics are solid

### Invariants

- Thread keywords must include all entity mentions from the conversation, not only thematic terms
- A fact key must not appear in more than one bucket
