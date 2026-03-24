import { getDocBySlug, getNextDoc } from "../docs/content";
import { renderMarkdown } from "../docs/markdown";

export const DocsPage = ({
  params,
}: {
  params?: { slug?: string };
}) => {
  const activeDoc = getDocBySlug(params?.slug);
  const nextDoc = getNextDoc(params?.slug);

  return (
    <>
      {activeDoc ? (
        <>
          <p className="landing-section-label">
            <em>familiar</em> docs
          </p>
          <h1 className="docs-title">{activeDoc.label}</h1>
          <div className="docs-content">{renderMarkdown(activeDoc.content)}</div>
          {nextDoc ? (
            <footer className="docs-footer">
              <p className="landing-section-label">Next</p>
              <a className="docs-next-link" href={`/docs/${nextDoc.slug}`}>
                <span className="docs-next-kicker">Continue to</span>
                <span className="docs-next-title">{nextDoc.label}</span>
              </a>
            </footer>
          ) : null}
        </>
      ) : (
        <>
          <p className="landing-section-label">Docs</p>
          <h1 className="docs-title">No documentation found.</h1>
        </>
      )}
    </>
  );
};
