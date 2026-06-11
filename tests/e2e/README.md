# familiar E2E Test Harness

End-to-end tests that verify the full familiar stack by making HTTP requests to a running dev server.

## Prerequisites

The E2E tests assume a familiar dev server is running locally:

```bash
# Terminal 1: start the dev server
npm run dev

# Terminal 2: run E2E tests
npm run test:e2e
```

## Environment

The tests expect the server at `http://localhost:5173` by default. Set `FAMILIAR_E2E_BASE_URL` to override:

```bash
FAMILIAR_E2E_BASE_URL=http://localhost:8787 npm run test:e2e
```

## Test Coverage

- `smoke.e2e.test.ts` — verifies the server is up and health endpoints respond
- `conversation.e2e.test.ts` — full conversation flow: create account, sync tools, send input

## Writing New E2E Tests

Use the `createE2EClient` helper from `harness.ts`:

```ts
import { createE2EClient } from "./harness.ts";

const client = createE2EClient();

// Create an account
const { token } = await client.createAccount();

// Use the token for authenticated requests
const response = await client.request("/api/v1/integration", {
  headers: { Authorization: `Bearer ${token}` },
});
```

## CI Integration

For CI, start the dev server in the background before running tests:

```bash
npm run dev &
DEV_PID=$!
sleep 10  # wait for server startup
npm run test:e2e
kill $DEV_PID
```
