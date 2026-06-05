"use client";

import type { ReactNode } from "react";
import { useState } from "react";

export const DocsMobileSidebar = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="docs-mobile-toggle"
        onClick={() => setOpen(!open)}
        aria-label="Toggle documentation navigation"
        aria-expanded={open}
        type="button"
      >
        {open ? "✕ Close menu" : "☰ Documentation menu"}
      </button>
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
