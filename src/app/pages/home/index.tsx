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

const PRICING = [
  {
    tier: "First 10 actions",
    price: "Free — try without commitment",
  },
  {
    tier: "Per action",
    price: "$0.10",
  },
  {
    tier: "Custom integration",
    price: "$500–2,000",
  },
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
        </div>
      </header>

      <section className="landing-section" id="what-it-fixes">
        <div className="section-heading">
          <p className="section-kicker">What it fixes</p>
        </div>
        <div className="fixes-grid">
          <div className="fix-row fix-header-row">
            <div className="fix-cell fix-header">Without familiar</div>
            <div className="fix-cell fix-header">With familiar</div>
          </div>
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
        </div>
        <div className="steps-grid">
          <div className="steps-list">
            <article className="step-item">
              <span className="step-number">01</span>
              <div>
                <h3 className="step-title">You define tools</h3>
                <p className="step-body">
                  What they do, what they need, in familiar.tools.json
                </p>
              </div>
            </article>
            <article className="step-item">
              <span className="step-number">02</span>
              <div>
                <h3 className="step-title">You expose an endpoint</h3>
                <p className="step-body">One URL where your code runs</p>
              </div>
            </article>
            <article className="step-item">
              <span className="step-number">03</span>
              <div>
                <h3 className="step-title">familiar handles the rest</h3>
                <p className="step-body">
                  Receives text, picks the tool, calls your code, stores what
                  happened, replies where you are
                </p>
              </div>
            </article>
          </div>
        </div>
        <p className="section-closing">
          Your code. Your logic. familiar adds the conversation layer you don't
          want to build again.
        </p>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <p className="section-kicker">Who it's for</p>
        </div>
        <div className="overview-grid">
          <div className="overview-copy">
            <p>
              People with /scripts folders. People who cron jobs and curl APIs.
              People who want their personal software to feel like one system,
              not ten disconnected tools.
            </p>
            <p>
              AI agents can build with familiar too — it's schema-first,
              code-friendly, minimal approval needed. But it's built for humans
              who own their tools.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <p className="section-kicker">Pricing</p>
        </div>
        <div className="fixes-grid">
          <div className="fix-row fix-header-row">
            <div className="fix-cell fix-header">Tier</div>
            <div className="fix-cell fix-header">Price</div>
          </div>
          {PRICING.map((item, index) => (
            <div key={index} className="fix-row">
              <div className="fix-cell fix-without">
                <p>{item.tier}</p>
              </div>
              <div className="fix-cell fix-with">
                <p>{item.price}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="section-closing">
          Usage-based. No subscription for silence.
        </p>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <p className="section-kicker">Get started</p>
        </div>
        <div className="get-started-snippet">
          <pre className="hero-snippet-code">{`npx familiar-cli init`}</pre>
          <p className="hero-snippet-label">Or via API:</p>
          <pre className="hero-snippet-code">{`curl -X POST https://familiar.chrsvdmrw.workers.dev/api/v1/accounts`}</pre>
        </div>
      </section>

      <section className="landing-section landing-section-docs">
        <div className="section-heading">
          <p className="section-kicker">Docs</p>
        </div>
        <div className="docs-links">
          <a href="/docs/cli">CLI</a>
          <span>·</span>
          <a href="/docs/sdk">SDK</a>
          <span>·</span>
          <a href="/docs/api-reference">API</a>
          <span>·</span>
          <a href="/docs/executors">Executors</a>
          <span>·</span>
          <a href="/docs/quickstart">Cookbook</a>
        </div>
      </section>

      <footer className="landing-footer">
        <div>
          <p className="footer-name">familiar</p>
          <p className="footer-copy">
            Your scripts, with a conversation layer.
          </p>
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
