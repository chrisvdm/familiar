# MVP Verification

## Context

The toolcall trigger fix (2026-04-20) closed the last known functional gap in the MVP. We now want a systematic pass across every MVP requirement — endpoints, behaviors, security constraints, and CLI — to confirm that the implementation matches the spec in `docs/blueprints/current-mvp-spec.md` and that each item can be demonstrated working in practice.

The prior MVP status review (2026-03-23) gave us ~85% complete. The main outstanding risk at that time was routing and argument extraction quality, which has since been resolved. This worklog verifies the full picture.

Local dev base URL: `http://localhost:5173`

---

## Scope

The verification covers every item in the MVP Definition of Done plus the full required endpoint surface. We go endpoint by endpoint, record the curl command, and note the result.

Notation:
- `BASE=http://localhost:5173`
- `TOKEN=<token from familiar init>`

---

## Test Plan

### Setup

Before running any endpoint tests, bootstrap a fresh account so we have a real token:

```bash
BASE=http://localhost:5173

# Create account and store token
node src/cli/familiar.mjs init --host $BASE
```

Store the printed token as `TOKEN` for subsequent steps.

```bash
TOKEN=<paste token here>
```

---

### 1. Account creation — `POST /api/v1/accounts`

```bash
curl -s -X POST $BASE/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

Expected shape:
```json
{
  "account": { "id": "acct_...", "created_at": "..." },
  "token": { "value": "fam_...", "prefix": "fam_...", "last_four": "...", "created_at": "..." }
}
```

Result: ☐ pass / ☐ fail

---

### 2. Account lookup — `GET /api/v1/account`

```bash
curl -s $BASE/api/v1/account \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected shape:
```json
{
  "account": { "id": "acct_..." },
  "setup": { "id": "setup_..." },
  "token": { "id": "tok_...", "prefix": "fam_...", "last_four": "...", "created_at": "...", "last_used_at": "..." }
}
```

Result: ☐ pass / ☐ fail

---

### 3. Conversation input — `POST /api/v1/input` (direct reply)

No tools attached — should return a direct reply.

```bash
curl -s -X POST $BASE/api/v1/input \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": { "kind": "text", "text": "Hello, what can you do?" },
    "channel": { "type": "web", "id": "test_browser_1", "name": "Test browser" }
  }' | jq .
```

Expected: `execution: null`, `reply` is non-empty string.

Result: ☐ pass / ☐ fail

---

### 4. Conversation input — tool call (implicit natural language)

```bash
curl -s -X POST $BASE/api/v1/input \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": { "kind": "text", "text": "Add buy dog food to my list" },
    "channel": { "type": "web", "id": "test_browser_1", "name": "Test browser" },
    "tools": [
      {
        "tool_name": "todos.add",
        "description": "Add a new item to the todo list",
        "input_schema": {
          "type": "object",
          "properties": {
            "todo_items": { "type": "array", "items": { "type": "string" } }
          },
          "required": ["todo_items"]
        },
        "status": "active"
      }
    ]
  }' | jq .
```

Expected: `execution` non-null, `execution.state` is `completed` or `accepted`.

Result: ☐ pass / ☐ fail

---

### 5. Conversation input — `@toolname` explicit shortcut

```bash
curl -s -X POST $BASE/api/v1/input \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": { "kind": "text", "text": "@todos.add buy milk" },
    "channel": { "type": "web", "id": "test_browser_1", "name": "Test browser" },
    "tools": [
      {
        "tool_name": "todos.add",
        "description": "Add a new item to the todo list",
        "input_schema": {
          "type": "object",
          "properties": {
            "todo_items": { "type": "array", "items": { "type": "string" } }
          },
          "required": ["todo_items"]
        },
        "status": "active"
      }
    ]
  }' | jq .
```

Expected: `execution` non-null, tool resolved to `todos.add`.

Result: ☐ pass / ☐ fail

---

### 6. Tools sync — `POST /api/v1/tools/sync`

```bash
curl -s -X POST $BASE/api/v1/tools/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tools": [
      {
        "tool_name": "spreadsheet.update_row",
        "description": "Update a spreadsheet row",
        "input_schema": {
          "type": "object",
          "properties": {
            "sheet": { "type": "string" },
            "row_id": { "type": "string" },
            "values": { "type": "object" }
          },
          "required": ["sheet", "row_id", "values"]
        },
        "status": "active"
      }
    ]
  }' | jq .
```

Expected: 200 with confirmation. Then send a natural language message — routing model should pick `spreadsheet.update_row`.

Result: ☐ pass / ☐ fail

---

### 7. Thread creation — `POST /api/v1/threads`

```bash
curl -s -X POST $BASE/api/v1/threads \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user_1",
    "title": "Test thread"
  }' | jq .
```

Note `thread_id` from response for subsequent tests.

```bash
THREAD_ID=<paste thread id here>
```

Result: ☐ pass / ☐ fail

---

### 8. Thread list — `GET /api/v1/users/:user_id/threads`

```bash
curl -s "$BASE/api/v1/users/test_user_1/threads" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected: array containing the thread created above.

Result: ☐ pass / ☐ fail

---

### 9. Thread rename — `PATCH /api/v1/threads/:thread_id`

```bash
curl -s -X PATCH "$BASE/api/v1/threads/$THREAD_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Renamed thread" }' | jq .
```

Expected: 200 with updated thread.

Result: ☐ pass / ☐ fail

---

### 10. Thread delete — `DELETE /api/v1/threads/:thread_id`

```bash
curl -s -X DELETE "$BASE/api/v1/threads/$THREAD_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected: 200 or 204. Thread should no longer appear in list.

Result: ☐ pass / ☐ fail

---

### 11. User memory — `GET /api/v1/users/:user_id/memory`

```bash
curl -s "$BASE/api/v1/users/test_user_1/memory" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected: memory document — may be sparse if user is new.

Result: ☐ pass / ☐ fail

---

### 12. Thread memory — `GET /api/v1/threads/:thread_id/memory`

Use a thread that has had at least one conversation turn (the channel `test_browser_1` thread from tests 3–5).

```bash
# First find the thread_id for test_browser_1 channel from the threads list
curl -s "$BASE/api/v1/users/test_user_1/threads" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Then inspect its memory
CHAT_THREAD_ID=<thread id from above>
curl -s "$BASE/api/v1/threads/$CHAT_THREAD_ID/memory?user_id=test_user_1" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected: thread memory document with summary/facts.

Result: ☐ pass / ☐ fail

---

### 13. Async executor callback — `POST /api/v1/webhooks/executor`

```bash
curl -s -X POST $BASE/api/v1/webhooks/executor \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user_1",
    "thread_id": "'$CHAT_THREAD_ID'",
    "result": {
      "execution_id": "exec_test_001",
      "state": "completed",
      "content": "Done! I added the item to your list."
    }
  }' | jq .
```

Expected: 200. Thread should now include the executor result as a message.

Result: ☐ pass / ☐ fail

---

### 14. Thread continuity — no `thread_id` supplied

Send two messages on the same channel without supplying `thread_id`. Confirm the second message continues the same thread.

```bash
# First message
curl -s -X POST $BASE/api/v1/input \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": { "kind": "text", "text": "My name is Alex." },
    "channel": { "type": "web", "id": "continuity_test_1", "name": "Continuity test" }
  }' | jq '{thread_id: .thread_id}'

# Second message — should continue same thread
curl -s -X POST $BASE/api/v1/input \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": { "kind": "text", "text": "What is my name?" },
    "channel": { "type": "web", "id": "continuity_test_1", "name": "Continuity test" }
  }' | jq '{thread_id: .thread_id, reply: .reply}'
```

Expected: both responses carry the same `thread_id`. Second reply references "Alex".

Result: ☐ pass / ☐ fail

---

### 15. Memory capture and recall

Send a fact, then verify it is stored in memory and recalled in a later turn.

```bash
# Store a fact
curl -s -X POST $BASE/api/v1/input \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": { "kind": "text", "text": "I have a dog named Biscuit." },
    "channel": { "type": "web", "id": "memory_test_1", "name": "Memory test" }
  }' | jq '{reply: .reply}'

# Recall it in a fresh channel (different thread)
curl -s -X POST $BASE/api/v1/input \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": { "kind": "text", "text": "What is my dog'\''s name?" },
    "channel": { "type": "web", "id": "memory_test_2", "name": "Memory test 2" }
  }' | jq '{reply: .reply}'
```

Expected: second reply references "Biscuit" despite being in a different thread.

Result: ☐ pass / ☐ fail

---

### 16. Private thread — memory exclusion

```bash
# Send message on a private thread
curl -s -X POST $BASE/api/v1/input \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": { "kind": "text", "text": "My secret is that I have a cat named Whisper." },
    "channel": { "type": "web", "id": "private_test_1", "name": "Private test" },
    "thread_options": { "private": true }
  }' | jq '{thread_id: .thread_id, reply: .reply}'

# Confirm the cat name is NOT in memory
curl -s "$BASE/api/v1/users/test_user_1/memory" \
  -H "Authorization: Bearer $TOKEN" | jq . | grep -i whisper || echo "not in memory (expected)"
```

Expected: "Whisper" does not appear in the user's shared memory.

Result: ☐ pass / ☐ fail

---

### 17. Authentication — unauthenticated request rejected

```bash
curl -s -X POST $BASE/api/v1/input \
  -H "Content-Type: application/json" \
  -d '{"input": {"kind": "text", "text": "hello"}, "channel": {"type": "web", "id": "x"}}' | jq .
```

Expected: 401 with `"code": "unauthenticated"`.

Result: ☐ pass / ☐ fail

---

### 18. Authentication — invalid token rejected

```bash
curl -s -X POST $BASE/api/v1/input \
  -H "Authorization: Bearer fam_notarealtoken" \
  -H "Content-Type: application/json" \
  -d '{"input": {"kind": "text", "text": "hello"}, "channel": {"type": "web", "id": "x"}}' | jq .
```

Expected: 401 with `"code": "unauthenticated"`.

Result: ☐ pass / ☐ fail

---

### 19. CLI — `familiar init`

```bash
node src/cli/familiar.mjs init --host $BASE
```

Expected: prints `Account ID`, `API Token`, and `Stored token at: ~/.codex/familiar/config.json`.

Result: ☐ pass / ☐ fail

---

### 20. CLI — `familiar account show`

```bash
node src/cli/familiar.mjs account show --host $BASE
```

Expected: prints `Account ID`, `Setup ID`, `Token ID`, `Token Prefix`.

Result: ☐ pass / ☐ fail

---

### 21. CLI — `familiar whoami`

```bash
node src/cli/familiar.mjs whoami --host $BASE
```

Expected: same output as `account show`.

Result: ☐ pass / ☐ fail

---

### 22. Web UI — conversation through same core path

Manual: open `http://localhost:5173` in a browser.
- Send a message. Confirm a reply appears.
- Switch thread. Confirm history persists.
- Send a message that triggers a tool (if executor sandbox is running). Confirm `execution` state.

Result: ☐ pass / ☐ fail

---

## Ran automated verification — 2026-04-22

We ran all 21 automated tests against the local dev server at `http://localhost:5173`.

### Blockers encountered and resolved

**Executor base URL not set on fresh accounts**: `POST /api/v1/input` with tools returned `"Executor base URL is not configured."` for new accounts because `base_url` is null until set. Resolution: use `PATCH /api/v1/integration` to configure the executor URL before running tool-call tests.

**Account token ≠ executor token**: After setting the executor URL to the built-in sandbox, tool calls failed with `"Missing or invalid executor token."` The demo executor only accepts `dev-token` (the built-in demo token), not dynamically created account tokens. Resolution: tool-call tests (4, 5) were run using the built-in demo provider (`integration_id: demo_executor`) to exercise the full execution path end-to-end.

**Thread creation requires `channel`**: `POST /api/v1/threads` threw `Cannot read properties of undefined (reading 'type')` when `channel` was omitted. The test plan had an incomplete payload. Resolution: added `channel` field.

**`thread_options.private` is not a field on conversation input**: `POST /api/v1/input` ignores `thread_options`. Private threads must be pre-created via `POST /api/v1/threads` with `is_private: true`, then addressed by `thread_id`. Resolution: test 16 was retried using the correct two-step flow.

**Invalid token returns 403 not 401**: The spec says `"code": "unauthenticated"` for invalid tokens but the runtime returns `403 forbidden` with `"Unknown provider."` for a bad token. An absent token correctly returns 401. This is a minor spec/implementation mismatch — the error semantics are correct but the HTTP status diverges from the expected value.

**Response shape uses `response.content` not `reply`**: The actual response shape is `{ response: { type, content } }` not `{ reply }`. Test plan curl commands updated mentally during the run.

### Memory finding

Pet name cross-thread recall (test 15) failed on first attempt. Investigation:

- Thread memory shows `summary: "Alex has a dog named Biscuit."` — extraction ran and built the summary.
- `family: {}` in global memory — no `dog_name` fact was promoted.
- The cheap extraction model output `thread_facts: [{key: "species", value: "golden retriever"}]` instead of `profile_facts: [{pair: ["dog_name", "Biscuit"]}]`.
- The code correctly handles `dog_name` facts when the model outputs them. The gap is model reliability, not code logic.
- Name facts (`first_name`, `name`) are reliably extracted. Pet name facts are not.

This is an existing backlog item (#4 — composite interest extraction). The memory system's infrastructure is sound; the extraction model needs better prompting or a stronger model for pet facts.

**Private thread memory exclusion** (test 16) was verified to be working: the private thread `ef256e60` did not appear in thread summaries, and facts from that thread were not promoted to global memory. The `cat_name: Whisper` fact that appeared came from the earlier non-private test thread (`ca86ea5e`), confirmed by `sourceThreadId`.

## Results

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | POST /api/v1/accounts | ✅ pass | |
| 2 | GET /api/v1/account | ✅ pass | |
| 3 | POST /api/v1/input — direct reply | ✅ pass | Response shape is `response.content`, not `reply` |
| 4 | POST /api/v1/input — implicit tool call | ✅ pass | Must use built-in demo provider; new account executor token mismatch documented |
| 5 | POST /api/v1/input — @shortcut | ✅ pass | Same provider caveat as #4 |
| 6 | POST /api/v1/tools/sync | ✅ pass | |
| 7 | POST /api/v1/threads | ✅ pass | `channel` is required — test plan corrected |
| 8 | GET /api/v1/users/:user_id/threads | ✅ pass | |
| 9 | PATCH /api/v1/threads/:thread_id | ✅ pass | |
| 10 | DELETE /api/v1/threads/:thread_id | ✅ pass | |
| 11 | GET /api/v1/users/:user_id/memory | ✅ pass | |
| 12 | GET /api/v1/threads/:thread_id/memory | ✅ pass | |
| 13 | POST /api/v1/webhooks/executor | ✅ pass | `channel_delivery: failed` expected — no live WS channel in curl test |
| 14 | Thread continuity (no thread_id) | ✅ pass | Same thread_id returned; second reply referenced "Alex" |
| 15 | Memory capture and recall | ⚠️ partial | Name facts recalled correctly; pet name (`dog_name`) not promoted to global memory — extraction model reliability gap (backlog #4) |
| 16 | Private thread — memory exclusion | ✅ pass | Private thread absent from summaries; facts confirmed sourced from non-private thread only. Requires two-step flow: create thread first, then pass `thread_id` — `thread_options` on input is not supported |
| 17 | Unauthenticated request rejected | ✅ pass | 401 `unauthenticated` |
| 18 | Invalid token rejected | ✅ pass | Fixed 2026-04-23: unknown/invalid tokens now return 401 `unauthenticated`. Ambiguous-token 403 preserved. Issues #9 closed. |
| 19 | CLI — familiar init | ✅ pass | |
| 20 | CLI — familiar account show | ✅ pass | |
| 21 | CLI — familiar whoami | ✅ pass | |
| 22 | Web UI | ⬜ not run | Manual only — deferred to user |

## Findings filed as issues

- **Executor token mismatch — filed as #7, then closed as false alarm**: When using a fresh account, tool calls against the built-in demo executor failed with `"Missing or invalid executor token."` We initially filed this as a product gap. On review, the demo executor intentionally hardcodes a check for `dev-token` because it is only ever called by the built-in demo provider. For real integrations, the developer controls their own executor and decides whether to validate the incoming Authorization header. Familiar correctly sends the account's API token — no change needed. Issue #7 closed.
- **`thread_options.private` on conversation input is silently ignored**: The type definition does not include this field. Private threads must be pre-created. This could be a documentation gap or a missing convenience feature. Filing as backlog.
- **Test 18 HTTP status mismatch**: Invalid token returns 403 not 401 — the spec says `unauthenticated` for unknown tokens but the code returns `forbidden`. Low severity; filing as backlog note.
