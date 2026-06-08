"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { FamiliarMark } from "@/app/components/familiar-mark";

type PublicSiteNavProps = {
  brandLabel?: string;
  navActions?: ReactNode;
};

export const PublicSiteNav = ({
  brandLabel,
  navActions,
}: PublicSiteNavProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="public-nav-wrap">
      <div className="landing-shell public-nav-shell">
        <nav
          className="landing-nav docs-nav-bar public-nav"
          aria-label="Primary"
        >
          <a
            className="landing-nav-brand docs-nav-brand"
            href="/"
            aria-label="familiar home"
          >
            <FamiliarMark className="landing-nav-logo docs-nav-logo" />
            {brandLabel ? (
              <span className="docs-nav-title">{brandLabel}</span>
            ) : null}
          </a>
          <button
            className="nav-hamburger mobile--only"
            onClick={() => setOpen(!open)}
            aria-label="Toggle navigation"
            aria-expanded={open}
            type="button"
          >
            {open ? "✕" : "☰"}
          </button>
          <div
            className={`landing-nav-links docs-nav-links nav-links ${
              open ? "nav-links--open" : ""
            }`}
          >
            <a
              className="landing-nav-link"
              href="/#overview"
              onClick={() => setOpen(false)}
            >
              About
            </a>
            <a
              className="landing-nav-link"
              href="/docs/"
              onClick={() => setOpen(false)}
            >
              Docs
            </a>
            <a
              className="landing-nav-link"
              href="/setup"
              onClick={() => setOpen(false)}
            >
              Setup
            </a>
          </div>
          {navActions ? (
            <div className="docs-nav-actions">{navActions}</div>
          ) : null}
        </nav>
      </div>
    </div>
  );
};
