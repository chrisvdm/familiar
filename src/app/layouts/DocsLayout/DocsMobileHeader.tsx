"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import DocsHeader from "./DocsHeader";

export const DocsMobileHeader = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="docs-header-mobile mobile--only">
        <DocsHeader />
        <button
          className="docs-mobile-toggle"
          onClick={() => setOpen(!open)}
          aria-label="Toggle documentation navigation"
          aria-expanded={open}
          type="button"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>
      <aside
        className={`docs-sidebar padding--medium border-right ${
          open ? "docs-sidebar--open" : ""
        }`}
      >
        {children}
      </aside>
    </>
  );
};
