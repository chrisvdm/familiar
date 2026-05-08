import { FamiliarMark } from "@/app/components/familiar-mark";

const OVERVIEW = [
  "Receives text from any channel.",
  "Decides which tool to call.",
  "Executes it via webhook.",
  "Remembers context across conversations.",
];

const GET_STARTED = [
  {
    step: "01",
    title: "Create an account",
    body: "Get a token for the current familiar setup.",
  },
  {
    step: "02",
    title: "Describe your tools",
    body: "Sync the tools and workflows your system exposes.",
  },
  {
    step: "03",
    title: "Send input",
    body: "Post user messages and let your executor, workflow, or backend do the work.",
  },
];

const PRINCIPLES = [
  {
    title: "Routing stays separate from execution",
    body: "familiar keeps thread context, memory, and routing logic in one place instead of spreading it across every tool or workflow.",
  },
  {
    title: "Tools define a clear contract",
    body: "Each tool declares what it does and what input it needs. That gives familiar a reliable way to ask questions and send structured requests.",
  },
  {
    title: "Your executors stay in control",
    body: "familiar does not replace your code or business logic. It decides when to call it and passes clean, validated input into the systems you already own.",
  },
  {
    title: "Missing details are asked for first",
    body: "If a request is incomplete, familiar asks a follow-up question first instead of guessing and sending a bad tool call.",
  },
];

const LIFECYCLE = [
  {
    step: "01",
    title: "Text arrives",
    body: "A message comes in from web chat, WhatsApp, email, Slack, or any other channel.",
  },
  {
    step: "02",
    title: "Context is loaded",
    body: "familiar finds the right thread, loads recent messages, and recalls relevant memory.",
  },
  {
    step: "03",
    title: "A tool is chosen",
    body: "familiar decides which tool matches the request. If details are missing, it asks first.",
  },
  {
    step: "04",
    title: "Your executor runs",
    body: "familiar calls your webhook with structured arguments. Your code does the work and returns the result.",
  },
];

const EXAMPLES = [
  {
    title: "Single tool flow",
    href: "/sandbox/demo-executor",
    body: "One message becomes one tool call and one response. This is the simplest end-to-end example.",
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
          <a className="landing-nav-link" href="#overview">
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
              A hosted tool router with memory.
            </p>
            <p className="hero-detail">
              Receives text from any channel, decides which tool to call,
              executes it via webhook, and remembers context across
              conversations — so the next message picks up where the last
              one left off.
            </p>
          </div>
          <div className="hero-snippet">
            <p className="hero-snippet-label">Install the CLI and create an account</p>
            <pre className="hero-snippet-code">{`npm install -g familiar-cli
familiar init`}</pre>
            <div className="hero-actions">
              <a className="hero-primary" href="/docs/cli">
                CLI docs
              </a>
              <a className="hero-secondary" href="/docs/quickstart">
                Quickstart
              </a>
            </div>
          </div>
        </div>
      </header>

    <section className="landing-section" id="overview">
      <div className="section-heading">
        <p className="section-kicker">Overview</p>
        <h2 className="section-title">
          Route tools from text without rebuilding thread logic.
        </h2>
      </div>
      <div className="overview-grid">
        <div className="overview-copy">
          <p>
            Most systems already have tools. The missing piece is routing
            natural language to the right tool and keeping context across
            messages.
          </p>
          <p>
            familiar receives text, finds the right thread, asks for missing
            details, and calls your executor with clean, structured input.
          </p>
        </div>
        <div className="overview-list">
          {OVERVIEW.map((item) => (
            <div key={item} className="overview-item">
              <span className="overview-mark" aria-hidden="true">
                +
              </span>
              <p>{item}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="landing-section">
      <div className="section-heading">
        <p className="section-kicker">Get Started</p>
        <h2 className="section-title">
          Connect familiar to the systems you already have.
        </h2>
      </div>
      <div className="steps-grid">
        <div className="steps-code">
          <p className="panel-label">Basic request path</p>
          <pre className="panel-code">{`POST /api/v1/accounts
POST /api/v1/tools/sync
POST /api/v1/input
POST /api/v1/webhooks/executor`}</pre>
        </div>
        <div className="steps-list">
          {GET_STARTED.map((item) => (
            <article key={item.step} className="step-item">
              <span className="step-number">{item.step}</span>
              <div>
                <h3 className="step-title">{item.title}</h3>
                <p className="step-body">{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>

    <section className="landing-section">
      <div className="section-heading">
        <p className="section-kicker">Principles</p>
        <h2 className="section-title">
          Keep routing separate from execution.
        </h2>
      </div>
      <div className="principles-grid">
        {PRINCIPLES.map((item) => (
          <article key={item.title} className="principle-card">
            <h3 className="principle-title">{item.title}</h3>
            <p className="principle-body">{item.body}</p>
          </article>
        ))}
      </div>
    </section>

    <section className="landing-section">
      <div className="section-heading">
        <p className="section-kicker">Request Lifecycle</p>
        <h2 className="section-title">
          What happens after text arrives.
        </h2>
      </div>
      <div className="lifecycle-grid">
        <div className="lifecycle-list">
          {LIFECYCLE.map((item) => (
            <article key={item.step} className="lifecycle-item">
              <span className="step-number">{item.step}</span>
              <div>
                <h3 className="step-title">{item.title}</h3>
                <p className="step-body">{item.body}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="lifecycle-diagram">
          <p className="panel-label">Mental model</p>
          <pre className="panel-code panel-code-dark">{`user message
    |
    v
 familiar
    |
    +--> direct reply
    +--> follow-up question
    +--> executor call --> result --> familiar --> user`}</pre>
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
            A hosted tool router with memory.
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
