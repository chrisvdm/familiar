
import Footer from "./Footer";
import Hero from "./Hero";
import Navigation from "./Navigation";
import Section from "@/app/components/Section/Section";
import Grid from "@/app/components/Grid/Grid"
import Code from "@/app/components/Code/Code"
import LiveDemo from "./LiveDemo";

const FIXES = [
  [
    "SSH into server to check job status",
    "\"Status?\" from WhatsApp → instant reply",
  ],
  [
    "Script finishes, you don't know",
    "\"Done. 3 warnings.\" pushed to your watch",
  ],
  ["Every new tool needs custom integration",
    "One JSON schema, familiar handles the rest",
  ],

  // [
  //   "ChatGPT answers, but can't act",
  //   "Ask, route, execute, remember — in one thread",
  // ]
  
];

export const Home = () => (
  <main className="page">
    <div className="page__shell">

      <Navigation />

      <Hero />

      <Section id="the-problem" title="The problem">
        <Grid
          columns={['Without familiar', 'With familiar']}
          rows={FIXES} />
      </Section>

      <Section id="how-it-works" title="How it works">
        <div className="steps-list">
          <article className="step-item">
            <div>
              <h3 className="step-title">01. You define tools</h3>
              <p className="step-body">
                What they do, what they need, in familiar.tools.json or via CLI.
              </p>
              <Code>{`[
  {
    "tool_name": "todoList",
    "description": "Add an item to a todolist",
    "input_schema": {
      "type": "object",
      "properties": {
        "item": { "type": "string" },
      },
      "required": ["item"]
    },
    "status": "active"
  }
]`}</Code>

            </div>
          </article>
          <article className="step-item">
            <div>
              <h3 className="step-title">02. You expose an endpoint</h3>
              <p className="step-body">One URL where your code runs</p>
              <Code>{`familiar set-url <url>`}</Code>
            </div>
          </article>
          <article className="step-item">
            <div>
              <h3 className="step-title">03. familiar handles the rest</h3>
              <p className="step-body">
                Receives text, picks the tool, calls your code, stores what
                happened, replies where you are
              </p>
              <img className="img margin-top--xl" src='img02.svg' alt="diagram explaining familiar flow"/>
             <img className="img" src='img03.svg'/>
            </div>
          </article>
        </div>
        {/* <p className="section-closing">
          Your code. Your logic. familiar adds the conversation layer you don't
          want to build again.
        </p> */}
      </Section>

      <Section id="who-its-for" title="Who it's for">
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
      </Section>

      <LiveDemo/>

      <Section id="docs" title="Docs">
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
      </Section>

      <Footer />
    </div>
  </main>
);
