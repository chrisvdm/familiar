import type { BrowserSession } from "@/app/session/session";
import Navigation from "./home/Navigation";
import Footer from "./home/Footer";

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
    <>
      <Navigation />
      <main className="page">
        <div className="page__shell">
          <section className="setup-hero">
            <p className="setup-eyebrow">Hosted Onboarding</p>
            <h1 className="setup-title">Get started with familiar</h1>
            <p className="setup-copy">
              Create an account and go straight to your dashboard. Your API
              token is available there whenever you need it.
            </p>
          </section>

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
                className="setup-form"
              >
                <input
                  type="email"
                  name="email"
                  placeholder="Email"
                  required
                  autoComplete="email"
                  className="setup-input"
                />
                <input
                  type="password"
                  name="password"
                  placeholder="Password"
                  required
                  autoComplete="new-password"
                  minLength={8}
                  className="setup-input"
                />
                <button
                  className="setup-button setup-button--secondary"
                  type="submit"
                >
                  Register
                </button>
              </form>
            </section>
          </div>

          <p className="setup-signin">
            Already have an account?{" "}
            <a href="/dashboard" className="setup-signin-link">
              Sign in
            </a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
};
