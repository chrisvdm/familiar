"use client";

import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import DocsHeader from "./DocsHeader";

export const DocsMobileHeader = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    console.log("[DocsMobileHeader] open state:", open);
  }, [open]);

  return (
    <>
      <div className="docs-header-mobile mobile--only">
        <DocsHeader />
        <button
          className="docs-mobile-toggle"
          onClick={() => {
            console.log("[DocsMobileHeader] toggle clicked, current:", open);
            setOpen(!open);
          }}
          aria-label="Toggle documentation navigation"
          aria-expanded={open}
          type="button"
        >
          {open ? "✕ Close" : "☰ Menu"}
        </button>
      </div>
      <aside
        className={`docs-sidebar padding--medium border-right ${
          open ? "docs-sidebar--open" : ""
        }`}
        style={{ display: open ? "block" : "none" }}
        data-open={open}
      >
        {children}
      </aside>
    </>
  );
};
