# familiar Auth Onboarding Direction

## Purpose

This document defines the recommended authentication roadmap for _familiar_.

The immediate product priority is:

- let a user create an account easily
- issue an API token quickly
- make that token usable from the CLI, curl, and AI-driven setup flows

## Core Decision

Passkeys should not be the MVP foundation for hosted onboarding.

They are useful for a future web dashboard, but they are not a good primary primitive for:

- CLI-first onboarding
- AI-assisted setup
- non-interactive or low-interaction automation

So the first auth slice should optimize for token issuance, not browser-native identity ceremony.

## Recommended Roadmap

### MVP

The first hosted onboarding slice should be:

1. create account
2. issue first API token immediately
3. show that token once
4. let the user call _familiar_ with it

This can be one simple operation.

For now:

- no email verification is required
- no passkey is required
- no separate setup id is required in the happy path
- the token identifies the current familiar setup

That makes the product much easier for:

- curl users
- CLI users
- AI agents

### Next Step

Once account creation and token usage work, add:

- authenticated `GET /api/v1/account`
- optional additional token issuance if the product later needs it
- token revocation
- last-used timestamps
- a CLI flow that can create an account and store the token locally

This is the right time to harden the control plane for repeated use.

### CLI Login And Account Claiming

The next auth step should preserve one important product rule:

- a machine token may exist before a human login exists

That means the model should not assume every account starts with a browser-authenticated human user.

The product should support two valid starting points:

1. CLI-first bootstrap
2. web-first signup

The recommended model is a two-phase account lifecycle:

1. provisional account
2. claimed account

A provisional account can exist without a human owner login.

A claimed account has at least one authenticated human user attached to it.

In the CLI-first case, the system should be able to:

- create an account or setup
- issue an API token immediately
- store that token locally on the machine
- let a human claim or attach that account later from the web

In the web-first case, the system should be able to:

- let a human sign in with Google or passkey
- create or find their account
- issue an API token for later CLI use

So the durable model should separate:

- human login identity
- browser session
- machine API tokens
- the account or setup they attach to

Practical implication:

- API tokens authenticate machines
- Google and passkeys authenticate humans
- browser sessions track the signed-in human
- the account is the shared resource both of them can attach to

This avoids a bad coupling where the API token is modeled as if it were the human user identity.

Recommended account-state rule:

- machine-first bootstrap creates a provisional account
- browser-authenticated ownership converts that account into a claimed account

### Browser-Assisted CLI Login

A future `familiar login` flow can work similarly to Cloudflare's browser-assisted login flow.

Recommended shape:

1. the CLI starts a login flow
2. the CLI opens a browser window
3. the browser flow signs the human in with Google or passkey
4. the hosted app links that human to an existing provisional account or creates a new claimed one
5. the hosted app returns or issues a machine-usable API token for the CLI
6. the CLI stores that token locally for future commands

The browser flow should not make the browser session itself the CLI credential.

Instead:

- the browser is the human verification step
- the resulting API token is the machine credential the CLI stores and uses

If the CLI already has a local token for a provisional account, the login flow should:

1. use that local token to start a claim request
2. create a short-lived browser claim session
3. let the browser authenticate the human with Google or passkey
4. attach that human to the provisional account
5. mark the account as claimed

The important rule is:

- the long-lived credential stays on the local machine as an API token
- any browser claim bridge should be short-lived

### Local CLI Auth Storage

The CLI should keep local auth state in a small local file.

That file should store machine credentials, not browser session cookies.

It is reasonable for the CLI to maintain one local auth file and append or update account entries over time.

That local state may eventually need to support:

- one default account
- several saved accounts
- token rotation
- token revocation and replacement
- host-specific auth state for local, staging, or production hosts

The exact file format can stay flexible for now.

The important rule is:

- the local machine stores API tokens
- the hosted service stores the canonical account, user, and auth-method state

For the near-term product plan, it is reasonable for the CLI to check for an existing local auth file first and reuse that token when possible.

If no local token exists, the CLI can either:

- create a provisional account and store the returned token immediately
- or start a browser-assisted login flow that ends by issuing a token

That allows low-friction AI-agent bootstrap without forcing a browser at the first step.

### Later Web Dashboard

Once the account and token workflow is stable, add a hosted dashboard.

That dashboard can support:

- account details
- token management
- tool registry management
- executor configuration

This is the stage where passkeys become more attractive.

Passkeys fit well for:

- web login
- returning human users
- phishing-resistant dashboard access

They do not replace the need for API tokens.

### Later Passkey Support

Passkeys should be treated as a human web-auth layer, not the machine-auth layer.

That means:

- humans can sign in to the dashboard with a passkey
- the dashboard can then create, list, or revoke API tokens
- CLI and AI still use API tokens for actual setup and API calls

Google login should be treated the same way:

- humans can sign in to the hosted UI with Google
- the hosted UI can then create or link the account
- the hosted UI can issue or manage API tokens for CLI and AI use

## RedwoodSDK Passkey Addon

RedwoodSDK has an experimental passkey addon.

That is worth revisiting later for the hosted dashboard path.

But it should not block the MVP account-and-token flow.

## Practical Product Rule

The first question _familiar_ should answer is not:

- how do I log into a dashboard

It is:

- how do I get a working API token quickly

That is the correct first onboarding bar for both humans and AI.
