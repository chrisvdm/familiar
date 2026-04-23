"use client";

import { useState } from "react";

type CreateAccountResponse = {
  account: {
    id: string;
    created_at: string;
  };
  setup: {
    id: string;
  };
  token: {
    value: string;
    prefix: string;
    last_four: string;
    created_at: string;
  };
};

const curlExample = (token: string) =>
  `curl -X POST https://familiar.chrsvdmrw.workers.dev/api/v1/tools/sync \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tools": []
  }'`;

export const SetupClient = () => {
  const [result, setResult] = useState<CreateAccountResponse | null>(null);
  const [status, setStatus] = useState("");
  const [isPending, setIsPending] = useState(false);

  const handleCreateAccount = async () => {
    setIsPending(true);
    setStatus("");

    try {
      const response = await fetch("/api/v1/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
        }),
      });
      const payload = (await response.json()) as
        | CreateAccountResponse
        | { error?: { message?: string } };

      if (!response.ok || !("account" in payload) || !("token" in payload)) {
        const errorMessage =
          "error" in payload ? payload.error?.message : undefined;
        throw new Error(errorMessage || "Unable to create account.");
      }

      setResult(payload);
      setStatus("Account created. Copy the token now. It is only shown once.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create account.");
      setResult(null);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <section className="setup-shell">
      <header className="setup-hero">
        <p className="setup-eyebrow">Hosted Onboarding</p>
        <h1 className="setup-title">Create an account. Get an API token.</h1>
        <p className="setup-copy">
          This is the shortest current hosted setup path. It is designed to work
          for humans first, and it keeps the result machine-usable for CLI and AI
          flows.
        </p>
      </header>

      <div className="setup-grid">
        <section className="setup-panel">
          <h2 className="setup-panel-title">Create account</h2>
          <p className="setup-panel-copy">
            For now, this creates one account and immediately issues the first
            API token for the default familiar setup behind that account.
          </p>

          <button
            className="setup-button"
            disabled={isPending}
            onClick={handleCreateAccount}
            type="button"
          >
            {isPending ? "Creating..." : "Create account"}
          </button>

          {status ? <p className="setup-status">{status}</p> : null}
        </section>

        {/*
        <aside className="setup-panel">
          <h2 className="setup-panel-title">CLI direction</h2>
          <p className="setup-panel-copy">
            The intended primary setup path for humans and AI agents is:
          </p>
          <pre className="setup-code">
            <code>npx @familiar/cli@latest init</code>
          </pre>
          <p className="setup-panel-copy">
            The package is not published yet, so this page is the working hosted
            path today.
          </p>
        </aside>
        */}
      </div>

      {result ? (
        <section className="setup-panel">
          <h2 className="setup-panel-title">Your API token</h2>
          <p className="setup-panel-copy">
            Copy this token now. This page is the only place it is shown in full.
          </p>
          <div className="setup-result">
            <div className="setup-token">{result.token.value}</div>
            <pre className="setup-code">
              <code>{curlExample(result.token.value)}</code>
            </pre>
          </div>
        </section>
      ) : null}
    </section>
  );
};
