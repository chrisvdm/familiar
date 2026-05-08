import { FamiliarMark } from "@/app/components/familiar-mark";

const FIXES = [
  {
    without: "SSH into server to check job status",
    with: "\"Status?\" from WhatsApp → instant reply",
  },
  {
    without: "Script finishes, you don't know",
    with: "\"Done. 3 warnings.\" pushed to your watch",
  },
  {
    without: "Every new tool needs custom integration",
    with: "One JSON schema, familiar handles the rest",
  },
  {
    without: "ChatGPT answers, but can't act",
    with: "Ask, route, execute, remember — in one thread",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Define your tools",
    body: "What they do, what they need, in familiar.tools.json.",
  },
  {
    step: "02",
    title: "Expose an endpoint",
    body: "One URL where your code runs. familiar calls it.",
  },
  {
    step: "03",
    title: "familiar handles the rest",
    body: "Receives text, picks the tool, calls your code, stores what happened, replies where you are.",
  },
];

const EXAMPLES = [
  {
    title: "Single tool flow",
    href: "/sandbox/demo-executor",
    body: "One message becomes one tool call and one response. The simplest end-to-end example.",
  },
  {
    title: "Async callback",
    href: "/sandbox/async-countdown",
    body: "The executor accepts the work first and sends the final result later through the webhook.",
  },
  {
    title: "Pinned tool",
    href: "/sandbox/pinned-tool",
    body: "Later messages keep using the same selected tool until the user switches tools or exits that mode.",
  },
];

const RESOURCES = [
  { label: "Overview", href: "/docs/intro" },
  { label: "CLI", href: "/docs/cli" },
  { label: "SDK", href: "/docs/sdk" },
  { label: "Quickstart", href: "/docs/quickstart" },
  { label: "API reference", href: "/docs/api-reference" },
  { label: "Executors", href: "/docs/executors" },
  { label: "Webhooks", href: "/docs/webhooks" },
  { label: "Setup", href: "/setup" },
];

export const Home = () => (
  <main className="landing-page">
    <div className="landing-shell">
      <nav className="landing-nav" aria-label="Primary">
        <a className="landing-nav-brand" href="/" aria-label="familiar home">
          <FamiliarMark className="landing-nav-logo" />
        </a>
        <div className="landing-nav-links">
          <a className="landing-nav-link" href="#what-it-fixes">
            About
          </a>
          <a className="landing-nav-link" href="/docs/">
            Docs
          </a>
          <a className="landing-nav-link" href="/setup">
            Setup
          </a>
        </div>
      </nav>

      <header className="hero" id="hero">
        <div className="hero-panel">
          <div className="hero-copy">
            <h1 className="hero-title">familiar</h1>
            <p className="hero-subtitle">
              Your scripts, but you can text them.
            </p>
            <p className="hero-detail">
              You have tools that do things — backups, imports, checks, jobs.
              But you have to be at your computer to run them, and they never
              remember what happened last time.
            </p>
            <p className="hero-detail">
              familiar adds three things:{" "}
              <strong>reach</strong> (from any channel),{" "}
              <strong>memory</strong> (context across sessions), and{" "}
              <strong>routing</strong> (the right tool gets the right
              arguments, automatically).
            </p>
          </div>
          <div className="hero-snippet">
            <p className="hero-snippet-label">Get started</p>
            <pre className="hero-snippet-code">{`npx familiar-cli init`}</pre>
            <p className="hero-snippet-label">Or via API</p>
            <pre className="hero-snippet-code">{`curl -X POST https://familiar.chrsvdmrw.workers.dev/api/v1/accounts`}</pre>
            <div className="hero-actions">
              <a className="hero-primary" href="/docs/cli">
                CLI docs
              </a>
              <a className="hero-secondary" href="/docs/agent-quickstart">
                API docs
              </a>
            </div>
          </div>
        </div>
      </header>

      <section className="landing-section" id="what-it-fixes">
        <div className="section-heading">
          <p className="section-kicker">What it fixes</p>
          <h2 className="section-title">
            Without familiar vs. with familiar
          </h2>
        </div>
        <div className="fixes-grid">
          {FIXES.map((item, index) => (
            <div key={index} className="fix-row">
              <div className="fix-cell fix-without">
                <p>{item.without}</p>
              </div>
              <div className="fix-cell fix-with">
                <p>{item.with}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <p className="section-kicker">How it works</p>
          <h2 className="section-title">
            Your code. Your logic. familiar adds the conversation layer.
          </h2>
        </div>
        <div className="steps-grid">
          <div className="steps-list">
            {HOW_IT_WORKS.map((item) => (
              <article key={item.step} className="step-item">
                <span className="step-number">{item.step}</span>
                <div>
                  <h3 className="step-title">{item.title}</h3>
                  <p className="step-body">{item.body}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="steps-code">
            <p className="panel-label">familiar.tools.json</p>
            <pre className="panel-code">{`[
  {
    "tool_name": "backup.run",
    "description": "Run a backup",
    "input_schema": {
      "type": "object",
      "properties": {
        "target": { "type": "string" }
      },
      "required": ["target"]
    },
    "status": "active"
  }
]`}</pre>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <p className="section-kicker">Who it's for</p>
          <h2 className="section-title">
            People with /scripts folders.
          </h2>
        </div>
        <div className="overview-grid">
          <div className="overview-copy">
            <p>
              People who cron jobs and curl APIs. People who want their
              personal software to feel like one system, not ten disconnected
              tools.
            </p>
            <p>
              AI agents can build with familiar too — it's schema-first,
              code-friendly, minimal approval needed. But it's built for
              humans who own their tools.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <p className="section-kicker">Pricing</p>
          <h2 className="section-title">
            Usage-based. No subscription for silence.
          </h2>
        </div>
        <div className="pricing-grid">
          <div className="pricing-card">
            <span className="pricing-tier">First 10 actions</span>
            <span className="pricing-price">Free</span>
            <span className="pricing-note">Try without commitment</span>
          </div>
          <div className="pricing-card">
            <span className="pricing-tier">Per action</span>
            <span className="pricing-price">$0.10</span>
            <span className="pricing-note">Bundled AI costs included</span>
          </div>
          <div className="pricing-card">
            <span className="pricing-tier">Custom integration</span>
            <span className="pricing-price">$500–2,000</span>
            <span className="pricing-note">One-time setup fee</span>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <p className="section-kicker">Examples</p>
          <h2 className="section-title">See a few integration patterns.</h2>
          <p className="section-text">
            Start with a basic executor flow, then look at delayed results and
            tool-specific follow-up behavior.
          </p>
        </div>
        <div className="examples-grid">
          {EXAMPLES.map((item) => (
            <a key={item.href} className="example-card" href={item.href}>
              <h3 className="example-title">{item.title}</h3>
              <p className="example-body">{item.body}</p>
              <span className="example-link">Open example</span>
            </a>
          ))}
        </div>
      </section>

      <section className="landing-section landing-section-docs">
        <div className="section-heading">
          <p className="section-kicker">Docs</p>
          <h2 className="section-title">Read the setup and API documentation.</h2>
        </div>
        <div className="resources-grid">
          {RESOURCES.map((item) => (
            <a key={item.href} className="resource-link" href={item.href}>
              {item.label}
            </a>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <div>
          <p className="footer-name">familiar</p>
          <p className="footer-copy">
            Your scripts, with a conversation layer.
          </p>
        </div>
        <div className="footer-links">
          <a className="footer-link" href="/docs/">
            Docs
          </a>
          <a className="footer-link" href="/setup">
            Setup
          </a>
          <a className="footer-link" href="/sandbox/demo-executor">
            Demo
          </a>
        </div>
      </footer>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            (() => {
              const root = document.documentElement;
              const hero = document.getElementById("hero");
              if (!hero) return;

              const update = () => {
                const threshold = Math.max(80, hero.offsetTop + 24);
                root.classList.toggle("landing-nav-scrolled", window.scrollY > threshold);
              };

              update();
              window.addEventListener("scroll", update, { passive: true });
              window.addEventListener("resize", update);
            })();
          `,
        }}
      />
    </div>
  </main>
);
