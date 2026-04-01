import { docsAiCopy } from "../docs/ai-copy";

export const DocsAiPage = () => (
  <>
    <p className="landing-section-label">AI Copy</p>
    <h1 className="docs-title">AI-ready documentation</h1>
    <p className="docs-paragraph">
      This is the exact text copied by the <strong className="docs-strong">Copy for AI</strong> button.
    </p>
    <pre className="docs-code-block docs-code-block-ai">
      <code>{docsAiCopy}</code>
    </pre>
  </>
);
