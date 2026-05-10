import { loadOrCreateProviderUserContext } from "../provider/provider.storage";
import { getProviderHealth } from "../provider/provider.service";

export const Operator = async () => {
  return (
    <html>
      <head>
        <title>familiar — Operator</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          * { box-sizing: border-box; }
          body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; background: #0a0a0a; color: #e5e5e5; }
          h1 { font-size: 1.5rem; margin: 0 0 1.5rem; }
          h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin: 2rem 0 1rem; }
          .card { background: #141414; border: 1px solid #222; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; }
          .row { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #1a1a1a; }
          .row:last-child { border-bottom: none; }
          .label { color: #888; }
          .value { font-weight: 500; }
          .healthy { color: #4ade80; }
          .warning { color: #fbbf24; }
          .degraded { color: #f87171; }
          .event { padding: 0.5rem 0; border-bottom: 1px solid #1a1a1a; font-size: 0.875rem; }
          .event:last-child { border-bottom: none; }
          .event-time { color: #666; }
          .event-ok { color: #4ade80; }
          .event-error { color: #f87171; }
          .muted { color: #666; }
        `}</style>
      </head>
      <body>
        <h1>familiar operator</h1>
        <p className="muted">This dashboard requires a valid bearer token in the Authorization header.</p>
        <p className="muted">Use curl or an API client to inspect runtime state programmatically.</p>
      </body>
    </html>
  );
};
