import type { LayoutProps } from "rwsdk/router";

import { PublicSiteChrome } from "@/app/components/public-site-chrome";
import { docsAiCopy } from "@/app/docs/ai-copy";
import { defaultDoc, docs, getDocBySlug } from "@/app/docs/content";

export const DocsLayout = ({ children, requestInfo }: LayoutProps) => {
  const pathname = requestInfo
    ? new URL(requestInfo.request.url).pathname
    : "/docs";
  const nonce = requestInfo?.rw.nonce;
  const activeSlug =
    pathname.replace(/^\/docs\/?/, "").split("/")[0] || defaultDoc?.slug || "";
  const activeDoc = getDocBySlug(activeSlug);

  return (
    <PublicSiteChrome
      brandLabel="Docs"
      shellClassName="docs-shell"
      footer
      navActions={
        <button className="docs-copy-button" type="button" data-docs-ai-copy>
          Copy docs content
        </button>
      }
    >
      <section className="docs-layout">
        <aside className="docs-sidebar">
          <nav aria-label="Documentation">
            <ol className="docs-nav">
              {docs.map((entry) => (
                <li key={entry.slug} className="docs-nav-item">
                  <a
                    className={
                      entry.slug === activeDoc?.slug
                        ? "docs-nav-link docs-nav-link-active"
                        : "docs-nav-link"
                    }
                    href={`/docs/${entry.slug}`}
                  >
                    {entry.label}
                  </a>
                  {entry.slug === activeDoc?.slug && entry.sections.length > 0 ? (
                    <ul
                      className="docs-subnav"
                      aria-label={`${entry.label} sections`}
                    >
                      {entry.sections.map((section) => (
                        <li key={section.anchor} className="docs-subnav-item">
                          <a
                            className="docs-subnav-link"
                            href={`/docs/${entry.slug}#${section.anchor}`}
                          >
                            {section.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className="docs-main">{children}</article>
      </section>
      <textarea
        id="docs-ai-copy-source"
        aria-hidden="true"
        readOnly
        tabIndex={-1}
        style={{
          position: "absolute",
          left: "-9999px",
          top: "0",
          opacity: "0",
          pointerEvents: "none",
        }}
        value={docsAiCopy}
      />
      <script
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html: `
            (() => {
              const button = document.querySelector("[data-docs-ai-copy]");
              const source = document.getElementById("docs-ai-copy-source");
              if (!button || !source) return;

              const originalLabel = button.textContent;
              const copyText = async () => {
                const payload = source.value || "";

                if (!payload) {
                  throw new Error("No docs content available to copy.");
                }

                if (navigator.clipboard?.writeText) {
                  await navigator.clipboard.writeText(payload);
                  return;
                }

                source.removeAttribute("readonly");
                source.focus();
                source.select();
                source.setSelectionRange(0, payload.length);

                const copied = document.execCommand("copy");

                source.setAttribute("readonly", "readonly");
                window.getSelection()?.removeAllRanges();

                if (!copied) {
                  throw new Error("execCommand copy failed.");
                }
              };

              button.addEventListener("click", async () => {
                try {
                  await copyText();
                  button.textContent = "Copied";
                  window.alert("Docs content copied to your clipboard.");
                  window.setTimeout(() => {
                    button.textContent = originalLabel;
                  }, 1200);
                } catch {
                  button.textContent = "Copy failed";
                  window.setTimeout(() => {
                    button.textContent = originalLabel;
                  }, 1600);
                }
              });
            })();
          `,
        }}
      />
    </PublicSiteChrome>
  );
};
