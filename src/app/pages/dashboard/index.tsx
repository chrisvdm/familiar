import type { BrowserSession } from "@/app/session/session";
import {
  authenticateAccountToken,
  listAccountIntegrations,
} from "@/app/account/account.service";
import { getProviderHealth } from "@/app/provider/provider.service";
import { loadProviderUserContext } from "@/app/provider/provider.storage";
import DashboardNav from "./DashboardNav";
import StatusBar from "./StatusBar";
import HealthCard from "./HealthCard";
import EventsList from "./EventsList";

export const Dashboard = async ({
  ctx,
}: {
  ctx: { session?: BrowserSession };
}) => {
  const token = ctx.session?.apiToken;

  if (!token) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-shell">
          <DashboardNav />
          <div className="dashboard-empty">
            <h1 className="dashboard-empty-title">Operator dashboard</h1>
            <p className="dashboard-empty-body">
              Sign in with your API token to view integration health, recent
              events, and usage.
            </p>

            <form
              action="/dashboard/login"
              method="post"
              style={{
                marginTop: "32px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                alignItems: "center",
              }}
            >
              <input
                type="email"
                name="email"
                placeholder="Email"
                autoComplete="email"
                style={{
                  padding: "14px 18px",
                  border: "1px solid var(--line)",
                  borderRadius: "4px",
                  background: "rgba(255, 255, 255, 0.94)",
                  color: "var(--ink)",
                  fontSize: "15px",
                  fontFamily: "var(--sans)",
                  width: "min(360px, 90vw)",
                  outline: "none",
                }}
              />
              <input
                type="password"
                name="password"
                placeholder="Password"
                autoComplete="current-password"
                style={{
                  padding: "14px 18px",
                  border: "1px solid var(--line)",
                  borderRadius: "4px",
                  background: "rgba(255, 255, 255, 0.94)",
                  color: "var(--ink)",
                  fontSize: "15px",
                  fontFamily: "var(--sans)",
                  width: "min(360px, 90vw)",
                  outline: "none",
                }}
              />
              <div
                style={{
                  width: "min(360px, 90vw)",
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: "13px",
                  margin: "4px 0",
                }}
              >
                or
              </div>
              <input
                type="text"
                name="token"
                placeholder="Paste your API token"
                style={{
                  padding: "14px 18px",
                  border: "1px solid var(--line)",
                  borderRadius: "4px",
                  background: "rgba(255, 255, 255, 0.94)",
                  color: "var(--ink)",
                  fontSize: "15px",
                  fontFamily: "var(--sans)",
                  width: "min(360px, 90vw)",
                  outline: "none",
                }}
              />
              <button
                className="dashboard-empty-link"
                type="submit"
                style={{ border: "none", cursor: "pointer" }}
              >
                Sign in
              </button>
            </form>

            <div style={{ marginTop: "48px" }}>
              <p
                className="dashboard-empty-body"
                style={{ fontSize: "14px", color: "var(--muted)" }}
              >
                Don&apos;t have an account?
              </p>
              <a
                className="dashboard-empty-link"
                href="/setup"
                style={{
                  display: "inline-block",
                  marginTop: "12px",
                  background: "transparent",
                  border: "1px solid var(--line)",
                }}
              >
                Create account
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const auth = await authenticateAccountToken(token);

  if (!auth) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-shell">
          <DashboardNav />
          <div className="dashboard-empty">
            <h1 className="dashboard-empty-title">Session expired</h1>
            <p className="dashboard-empty-body">
              Your stored token is no longer valid. Sign in again to continue.
            </p>
            <form
              action="/dashboard/login"
              method="post"
              style={{
                marginTop: "32px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                alignItems: "center",
              }}
            >
              <input
                type="email"
                name="email"
                placeholder="Email"
                autoComplete="email"
                style={{
                  padding: "14px 18px",
                  border: "1px solid var(--line)",
                  borderRadius: "4px",
                  background: "rgba(255, 255, 255, 0.94)",
                  color: "var(--ink)",
                  fontSize: "15px",
                  fontFamily: "var(--sans)",
                  width: "min(360px, 90vw)",
                  outline: "none",
                }}
              />
              <input
                type="password"
                name="password"
                placeholder="Password"
                autoComplete="current-password"
                style={{
                  padding: "14px 18px",
                  border: "1px solid var(--line)",
                  borderRadius: "4px",
                  background: "rgba(255, 255, 255, 0.94)",
                  color: "var(--ink)",
                  fontSize: "15px",
                  fontFamily: "var(--sans)",
                  width: "min(360px, 90vw)",
                  outline: "none",
                }}
              />
              <div
                style={{
                  width: "min(360px, 90vw)",
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: "13px",
                  margin: "4px 0",
                }}
              >
                or
              </div>
              <input
                type="text"
                name="token"
                placeholder="Paste your API token"
                style={{
                  padding: "14px 18px",
                  border: "1px solid var(--line)",
                  borderRadius: "4px",
                  background: "rgba(255, 255, 255, 0.94)",
                  color: "var(--ink)",
                  fontSize: "15px",
                  fontFamily: "var(--sans)",
                  width: "min(360px, 90vw)",
                  outline: "none",
                }}
              />
              <button
                className="dashboard-empty-link"
                type="submit"
                style={{ border: "none", cursor: "pointer" }}
              >
                Sign in
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const accountId = auth.account.id;

  const integrations = await listAccountIntegrations(accountId);

  const activeIntegration =
    integrations.find((i) => i.id === ctx.session?.selectedIntegrationId) ??
    integrations[0];

  if (!activeIntegration) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-shell">
          <DashboardNav />
          <div className="dashboard-empty">
            <h1 className="dashboard-empty-title">No integrations</h1>
            <p className="dashboard-empty-body">
              Your account does not have any integrations yet.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const providerId = activeIntegration.id;

  const providerConfig = {
    token,
    ...(activeIntegration.baseUrl ? { baseUrl: activeIntegration.baseUrl } : {}),
    ...(activeIntegration.aiApiKey
      ? { aiApiKey: activeIntegration.aiApiKey }
      : {}),
  };

  const [health, context] = await Promise.all([
    getProviderHealth({ providerId, userId: "default", providerConfig }),
    loadProviderUserContext({ providerId, userId: "default" }),
  ]);

  const recentEvents = (context?.auditLog ?? []).slice(-20).reverse();

  const hasMultipleIntegrations = integrations.length > 1;

  return (
    <main className="dashboard-page">
      <div className="dashboard-shell">
        <DashboardNav />

        <section className="dashboard-section">
          <div className="section-heading">
            <p className="section-kicker">Overview</p>
            <h1 className="section-title">Status</h1>
          </div>
          <StatusBar
            toolCount={health.tools.count}
            threadCount={context?.threads.length ?? 0}
          />
        </section>

        <section className="dashboard-section">
          <div className="section-heading">
            <p className="section-kicker">Health</p>
            <h1 className="section-title">Integration</h1>
          </div>

          <div
            style={{
              marginTop: "16px",
              display: "flex",
              alignItems: "center",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: "var(--serif)",
                fontSize: "20px",
                fontWeight: 600,
                color: "var(--heading)",
              }}
            >
              {activeIntegration.name}
            </span>

            {hasMultipleIntegrations && (
              <form
                action="/dashboard/select-integration"
                method="post"
                style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
              >
                <select
                  name="integrationId"
                  defaultValue={activeIntegration.id}
                  style={{
                    padding: "8px 32px 8px 14px",
                    border: "1px solid var(--line)",
                    borderRadius: "4px",
                    background: "rgba(255,255,255,0.88)",
                    color: "var(--ink)",
                    fontSize: "14px",
                    fontFamily: "var(--sans)",
                    cursor: "pointer",
                    appearance: "none",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 10px center",
                  }}
                >
                  {integrations.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  style={{
                    padding: "8px 16px",
                    border: "1px solid var(--line)",
                    borderRadius: "4px",
                    background: "var(--soft)",
                    color: "var(--ink)",
                    fontSize: "13px",
                    fontFamily: "var(--sans)",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Switch
                </button>
              </form>
            )}
          </div>

          <p
            style={{
              margin: "8px 0 0",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "12px",
              color: "var(--muted)",
            }}
          >
            ID: {activeIntegration.id}
          </p>

          <HealthCard
            overall={health.overall}
            baseUrlConfigured={health.executor.base_url_configured}
            recentFailures={health.executor.recent_failures}
            toolCount={health.tools.count}
            activeTools={health.tools.active}
            recentCallbacks={health.callbacks.recent_count}
            deliveryFailures={health.delivery.recent_failures}
          />
        </section>

        <section className="dashboard-section">
          <div className="section-heading">
            <p className="section-kicker">Recent</p>
            <h1 className="section-title">Events</h1>
          </div>
          <EventsList events={recentEvents} />
        </section>

        <section className="dashboard-section">
          <div className="section-heading">
            <p className="section-kicker">Developers</p>
            <h1 className="section-title">API token</h1>
          </div>
          <div className="health-card">
            <p className="dashboard-empty-body" style={{ margin: 0 }}>
              Use this token to authenticate API requests and CLI commands.
            </p>
            <div
              style={{
                marginTop: "16px",
                padding: "14px 18px",
                border: "1px solid var(--line)",
                borderRadius: "4px",
                background: "rgba(28, 31, 87, 0.94)",
                color: "rgba(255, 255, 255, 0.96)",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "13px",
                overflowX: "auto",
                wordBreak: "break-all",
              }}
            >
              {token}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};
