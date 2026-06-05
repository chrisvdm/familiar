import type { LayoutProps } from "rwsdk/router";

import { docsAiCopy } from "@/app/docs/ai-copy";
import { defaultDoc } from "@/app/docs/content";
import DocsNav from "./DocsNav";
import DocsHeader from "./DocsHeader"
import PageSections from "./PageSections";
import { DocsMobileSidebar } from "./DocsMobileSidebar";

export const DocsLayout = ({ children, requestInfo }: LayoutProps) => {
  const pathname = requestInfo
    ? new URL(requestInfo.request.url).pathname
    : "/docs";

  const nonce = requestInfo?.rw.nonce;

  const activeSlug =
    pathname.replace(/^\/docs\/?/, "").split("/")[0] || defaultDoc?.slug || "";

  return (
<div className="width--12"> 
      <section className="docs-layout flex--row">
        <DocsMobileSidebar>
          <DocsHeader/>
          <DocsNav activeSlug={activeSlug}/>
        </DocsMobileSidebar>
        

        <article className="docs-main padding--large">{children}</article>
      
        <PageSections activeSlug={activeSlug}/>
      
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
      </div>
  );
};
