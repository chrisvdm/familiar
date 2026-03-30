# 2026-03-30 Browser-Assisted CLI Auth And Account Claiming

- documented that a machine token may exist before a human login exists
- clarified that future auth should separate:
  - browser-authenticated human users
  - browser session state
  - machine API tokens
  - the account or setup they attach to
- documented a future `familiar login` flow that can open a browser window, let the user authenticate with Google or passkey, and then issue or return a machine-usable API token to the CLI
- documented that local CLI auth should store API tokens on the machine rather than trying to reuse browser session cookies
- clarified that the product should support both:
  - CLI-first bootstrap followed by later account claiming
  - web-first signup followed by later CLI token issuance

Motivation:

- the existing MVP is intentionally token-first so CLI, curl, and AI setup flows stay low-friction
- adding Google or passkeys should extend the system with human login rather than replace machine-token auth
- a future browser-assisted login flow should verify the human in the browser and then hand the CLI a proper machine credential
