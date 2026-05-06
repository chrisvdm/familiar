"use client";

import { useEffect, useState } from "react";

type StoredToken = {
  value: string;
  prefix: string;
  lastFour: string;
  createdAt: string;
};

type PageState =
  | { phase: "loading" }
  | { phase: "ready-existing"; token: StoredToken }
  | { phase: "ready-new" }
  | { phase: "pending" }
  | { phase: "done" }
  | { phase: "error"; message: string };

const readStoredToken = (): StoredToken | null => {
  try {
    const raw = localStorage.getItem("familiar_token");
    if (!raw) { return null; }
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "value" in parsed &&
      "prefix" in parsed &&
      "lastFour" in parsed &&
      typeof (parsed as StoredToken).value === "string"
    ) {
      return parsed as StoredToken;
    }
  } catch {
    // ignore corrupt storage
  }
  return null;
};

const completeSession = async (sessionId: string, token: string) => {
  const response = await fetch(`/api/v1/auth/cli/sessions/${sessionId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(payload.error?.message ?? "Session could not be completed.");
  }
};

export const AuthCliClient = () => {
  const [state, setState] = useState<PageState>({ phase: "loading" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session");
    if (!sessionId) {
      setState({ phase: "error", message: "Missing session parameter." });
      return;
    }

    const stored = readStoredToken();
    if (stored) {
      setState({ phase: "ready-existing", token: stored });
    } else {
      setState({ phase: "ready-new" });
    }
  }, []);

  const sessionId = () => new URLSearchParams(window.location.search).get("session") ?? "";

  const handleUseExisting = async (token: StoredToken) => {
    setState({ phase: "pending" });
    try {
      await completeSession(sessionId(), token.value);
      setState({ phase: "done" });
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  };

  const handleCreateNew = async () => {
    setState({ phase: "pending" });
    try {
      const createResponse = await fetch("/api/v1/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!createResponse.ok) {
        throw new Error("Could not create account.");
      }
      const payload = (await createResponse.json()) as {
        token: { value: string; prefix: string; last_four: string; created_at: string };
      };

      const tokenValue = payload.token.value;
      localStorage.setItem(
        "familiar_token",
        JSON.stringify({
          value: tokenValue,
          prefix: payload.token.prefix,
          lastFour: payload.token.last_four,
          createdAt: payload.token.created_at,
        }),
      );

      await completeSession(sessionId(), tokenValue);
      setState({ phase: "done" });
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  };

  if (state.phase === "loading") {
    return (
      <div className="setup-shell">
        <p className="setup-copy">Loading…</p>
      </div>
    );
  }

  if (state.phase === "done") {
    return (
      <div className="setup-shell">
        <header className="setup-hero">
          <p className="setup-eyebrow">CLI Login</p>
          <h1 className="setup-title">Your CLI is connected.</h1>
          <p className="setup-copy">You can close this tab.</p>
        </header>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="setup-shell">
        <header className="setup-hero">
          <p className="setup-eyebrow">CLI Login</p>
          <h1 className="setup-title">Something went wrong.</h1>
          <p className="setup-copy">{state.message}</p>
        </header>
      </div>
    );
  }

  if (state.phase === "ready-existing") {
    const { token } = state;
    return (
      <div className="setup-shell">
        <header className="setup-hero">
          <p className="setup-eyebrow">CLI Login</p>
          <h1 className="setup-title">Connect your account to the CLI.</h1>
          <p className="setup-copy">
            You have an existing familiar account. Connect it to the CLI session.
          </p>
        </header>
        <div className="setup-grid">
          <section className="setup-panel">
            <h2 className="setup-panel-title">Existing account</h2>
            <p className="setup-panel-copy">
              Token: {token.prefix}···{token.lastFour}
            </p>
            <button
              className="setup-button"
              disabled={state.phase !== "ready-existing"}
              onClick={() => { void handleUseExisting(token); }}
              type="button"
            >
              Use this account
            </button>
          </section>
          <section className="setup-panel">
            <h2 className="setup-panel-title">Create a new account instead</h2>
            <p className="setup-panel-copy">
              This will create a fresh account and connect it to the CLI.
            </p>
            <button
              className="setup-button"
              onClick={() => { void handleCreateNew(); }}
              type="button"
            >
              Create new account
            </button>
          </section>
        </div>
      </div>
    );
  }

  if (state.phase === "ready-new") {
    return (
      <div className="setup-shell">
        <header className="setup-hero">
          <p className="setup-eyebrow">CLI Login</p>
          <h1 className="setup-title">Connect an account to the CLI.</h1>
          <p className="setup-copy">
            Create a familiar account and connect it to this CLI session.
          </p>
        </header>
        <div className="setup-grid">
          <section className="setup-panel">
            <h2 className="setup-panel-title">Create account and connect</h2>
            <p className="setup-panel-copy">
              A new account will be created and the token will be sent to your CLI.
            </p>
            <button
              className="setup-button"
              onClick={() => { void handleCreateNew(); }}
              type="button"
            >
              Create account and connect
            </button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-shell">
      <p className="setup-copy">Connecting…</p>
    </div>
  );
};
