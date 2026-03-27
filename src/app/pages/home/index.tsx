import { FamiliarMark } from "@/app/components/familiar-mark";

const OVERVIEW = [
  "Receives normalized user messages.",
  "Keeps the current conversation and useful context in view.",
  "Asks follow-up questions when required fields are missing.",
  "Calls the correct tool with structured input.",
];

const GET_STARTED = [
  {
    step: "01",
    title: "Create an account",
    body: "Get a token for the current setup.",
  },
  {
    step: "02",
    title: "Describe your tools",
    body: "Use familiar.json or sync tools through the API.",
  },
  {
    step: "03",
    title: "Send input",
    body: "Post user messages and let your executor do the actual work.",
  },
];

const PRINCIPLES = [
  {
    title: "Conversation context is kept here",
    body: "Message history, conversation state, and follow-up questions do not need to be rebuilt in every executor.",
  },
  {
    title: "Each tool declares its inputs",
    body: "Each tool has a name, a description, and an input schema. That makes the contract clear to a developer and precise for a model.",
  },
  {
    title: "The executor does the work",
    body: "familiar decides when a tool should run. Your executor performs the side effects and applies the business rules.",
  },
  {
    title: "Missing information is requested first",
    body: "If a message is missing required details, familiar asks for them before it sends a tool call.",
  },
];

const LIFECYCLE = [
  {
    step: "01",
    title: "Message is received",
    body: "A person sends a message through a web chat, messaging app, email flow, or another normalized input path.",
  },
  {
    step: "02",
    title: "Conversation context is loaded",
    body: "familiar finds the current conversation, loads recent context, and applies the configured memory policy.",
  },
  {
    step: "03",
    title: "The message is interpreted",
    body: "familiar determines whether to reply directly, ask a follow-up question, or prepare a tool call that matches the tool schema.",
  },
  {
    step: "04",
    title: "The tool runs",
    body: "Your executor receives structured input, does the work, and returns the result immediately or later through the webhook.",
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
  { label: "Intro", href: "/docs/intro" },
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
              A helper for turning user messages into clear actions.
            </p>
            <p className="hero-detail">
              API for receiving messages, tracking the current conversation,
              asking follow-up questions when details are missing, and sending
              structured input to tools.
            </p>
          </div>
          <div className="hero-actions">
            <a className="hero-primary" href="/docs/quickstart">
              Get started
            </a>
            <a className="hero-secondary" href="/docs/api-reference">
              Read the API
            </a>
          </div>
        </div>
      </header>

      <section className="landing-section" id="overview">
        <div className="section-heading">
          <p className="section-kicker">Overview</p>
          <h2 className="section-title">
            It makes user input clear enough for tools to use.
          </h2>
        </div>
        <div className="overview-grid">
          <div className="overview-copy">
            <p>
              People send messages in plain language. familiar keeps the current
              conversation in view, asks for missing details, and sends
              structured input to an executor when the request is ready.
            </p>
            <p>
              That lets the executor focus on the work itself instead of
              tracking conversation history and parsing raw user text.
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
            To get started, you need three parts.
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
            Designed to turn plain language into reliable tool input.
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
          <h2 className="section-title">How each message is processed.</h2>
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
          <h2 className="section-title">Try a few common patterns.</h2>
          <p className="section-text">
            Start with one tool call, then look at async work and tool-specific follow-up messages.
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
          <h2 className="section-title">Read the API and setup documentation.</h2>
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
            API for receiving user messages, storing conversation state, and
            calling external tools with structured input.
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
    </div>
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
  </main>
);
