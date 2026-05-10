import type { BrowserSession } from "@/app/session/session";

export const Setup = ({
  ctx,
}: {
  ctx: { session?: BrowserSession };
}) => {
  if (ctx.session?.apiToken) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/dashboard" },
    });
  }

  return (
    <section className="setup-shell">
      <header className="setup-hero">
        <p className="setup-eyebrow">Hosted Onboarding</p>
        <h1 className="setup-title">Get started with familiar</h1>
        <p className="setup-copy">
          Create an account and go straight to your dashboard. Your API
          token is available there whenever you need it.
        </p>
      </header>

      <div className="setup-grid">
        <section className="setup-panel">
          <h2 className="setup-panel-title">Quick start</h2>
          <p className="setup-panel-copy">
            No email required. One click for AI agents, CLI users, and anyone
            who wants a token immediately.
          </p>

          <form action="/setup/create" method="post">
            <button className="setup-button" type="submit">
              Create account
            </button>
          </form>
        </section>

        <section className="setup-panel">
          <h2 className="setup-panel-title">Register with email</h2>
          <p className="setup-panel-copy">
            Create a password-protected account for easy dashboard login.
          </p>

          <form
            action="/setup/create"
            method="post"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <input
              type="email"
              name="email"
              placeholder="Email"
              required
              autoComplete="email"
              style={{
                padding: "14px 18px",
                border: "1px solid var(--line)",
                borderRadius: "4px",
                background: "rgba(255, 255, 255, 0.94)",
                color: "var(--ink)",
                fontSize: "15px",
                fontFamily: "var(--sans)",
                outline: "none",
              }}
            />
            <input
              type="password"
              name="password"
              placeholder="Password"
              required
              autoComplete="new-password"
              minLength={8}
              style={{
                padding: "14px 18px",
                border: "1px solid var(--line)",
                borderRadius: "4px",
                background: "rgba(255, 255, 255, 0.94)",
                color: "var(--ink)",
                fontSize: "15px",
                fontFamily: "var(--sans)",
                outline: "none",
              }}
            />
            <button
              className="setup-button"
              type="submit"
              style={{
                background: "transparent",
                border: "1px solid var(--line)",
              }}
            >
              Register
            </button>
          </form>
        </section>
      </div>

      <p
        style={{
          marginTop: "32px",
          textAlign: "center",
          fontSize: "14px",
          color: "var(--muted)",
        }}
      >
        Already have an account?{" "}
        <a href="/dashboard" style={{ color: "var(--ink)", fontWeight: 600 }}>
          Sign in
        </a>
      </p>
    </section>
  );
};
