import type { ReactNode } from "react";

import { FamiliarMark } from "@/app/components/familiar-mark";

type PublicSiteNavProps = {
  brandLabel?: string;
  navActions?: ReactNode;
};

export const PublicSiteNav = ({
  brandLabel,
  navActions,
}: PublicSiteNavProps) => (
  <div className="public-nav-wrap">
    <div className="landing-shell public-nav-shell">
      <nav className="landing-nav docs-nav-bar public-nav" aria-label="Primary">
        <a className="landing-nav-brand docs-nav-brand" href="/" aria-label="familiar home">
          <FamiliarMark className="landing-nav-logo docs-nav-logo" />
          {brandLabel ? <span className="docs-nav-title">{brandLabel}</span> : null}
        </a>
        <div className="landing-nav-links docs-nav-links">
          <a className="landing-nav-link" href="/#overview">
            About
          </a>
          <a className="landing-nav-link" href="/docs/">
            Docs
          </a>
          <a className="landing-nav-link" href="/setup">
            Setup
          </a>
        </div>
        {navActions ? <div className="docs-nav-actions">{navActions}</div> : null}
      </nav>
    </div>
  </div>
);
