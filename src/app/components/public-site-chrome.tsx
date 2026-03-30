import type { ReactNode } from "react";

import { PublicSiteFooter } from "@/app/components/public-site-footer";
import { PublicSiteNav } from "@/app/components/public-site-nav";

type PublicSiteChromeProps = {
  children: ReactNode;
  brandLabel?: string;
  shellClassName?: string;
  mainClassName?: string;
  navActions?: ReactNode;
  footer?: boolean;
};

export const PublicSiteChrome = ({
  children,
  brandLabel,
  shellClassName,
  mainClassName = "landing-page public-page",
  navActions,
  footer = false,
}: PublicSiteChromeProps) => {
  const shellClasses = ["landing-shell", shellClassName].filter(Boolean).join(" ");

  return (
    <main className={mainClassName}>
      <PublicSiteNav brandLabel={brandLabel} navActions={navActions} />
      <div className={shellClasses}>
        {children}
        {footer ? <PublicSiteFooter /> : null}
      </div>
    </main>
  );
};
