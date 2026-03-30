# 2026-03-30 Provisional Account Claiming Plan

- adopted a two-phase account lifecycle as the planned auth direction:
  - provisional account
  - claimed account
- documented that machine-first bootstrap may create a provisional account with no human owner login attached yet
- documented that a later browser-assisted login should let a human claim that account with Google or passkey
- clarified that the CLI should keep the long-lived API token locally and use it to begin a short-lived claim flow when needed
- clarified that browser sessions should verify the human and attach ownership, not act as the CLI credential

Planned flow:

1. CLI or AI agent creates a provisional account
2. hosted service issues an API token immediately
3. CLI stores that token locally
4. later, the user runs `familiar login`
5. CLI opens a browser-assisted login flow
6. user signs in with Google or passkey
7. hosted service links that human to the provisional account
8. account becomes claimed

Motivation:

- some users and AI agents will want to start with a token and skip the browser initially
- the product still needs a later human-login path for dashboard access, recovery, and ownership
- separating provisional machine bootstrap from later human claim keeps both flows simple without conflating browser sessions and API tokens
