# familiar Agent DX Challenge

A reproducible benchmark for measuring how easily AI coding agents can build a familiar integration.

## The Challenge

Build a working familiar integration from scratch. The integration should expose a `weather.get` tool that returns the current weather for a given city.

## Success Criteria

1. **Account created** — a familiar account exists with a valid API token
2. **Tool synced** — `weather.get` is synced to familiar with a valid JSON Schema
3. **Executor reachable** — familiar can POST to the executor and receive a response
4. **End-to-end works** — sending "What's the weather in Paris?" to familiar returns a weather response (not an error)

## Constraints

- Use the familiar API directly (no CLI unless the agent chooses to)
- The executor can be a mock — it does not need to call a real weather API
- The executor must respond with a valid familiar execution payload

## Reference Implementation

See `weather-executor-template.ts` for a minimal working executor in TypeScript.

## Verification

Run the verification script after the agent claims completion:

```bash
npx tsx verify.ts <token> <base-url>
```

Or manually:

```bash
# 1. Check account exists
curl https://familiar.monster/api/v1/account \
  -H "Authorization: Bearer fam_..."

# 2. Check tools are synced
curl https://familiar.monster/api/v1/integration/status \
  -H "Authorization: Bearer fam_..."

# 3. Send test message
curl -X POST https://familiar.monster/api/v1/input \
  -H "Authorization: Bearer fam_..." \
  -H "Content-Type: application/json" \
  -d '{"input":{"kind":"text","text":"What'\''s the weather in Paris?"},"channel":{"type":"web","id":"test"}}'
```

## Scoring

Track these metrics for each agent:

| Metric | How to measure |
|--------|---------------|
| **Time to first sync** | Wall-clock time from start to `tools/sync` returning 200 |
| **API calls made** | Count of HTTP requests to familiar |
| **Human interventions** | Times the agent asks for help or clarification |
| **End-to-end success** | Does the weather query return a non-error response? |
| **Retry loops** | Times the agent repeats the same failed action |

## Running the Challenge

1. Give the agent this README and the API docs at https://familiar.monster/docs/agent-quickstart
2. Do not help unless the agent explicitly asks
3. Record all terminal output for scoring
4. Run verification when the agent says it is done

## Expected Difficulty

An agent with web access should complete this in 5–15 minutes. Friction points to watch for:

- Confusing `tool_name` vs `toolName` (API uses snake_case, SDK uses camelCase)
- Forgetting to set `base_url` or `ai_api_key`
- Not understanding the executor webhook payload shape
- Trying to use `familiar portal` in an environment without cloudflared
