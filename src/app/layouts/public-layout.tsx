import type { LayoutProps } from "rwsdk/router";

import { PublicSiteChrome } from "@/app/components/public-site-chrome";

export const PublicLayout = ({ children }: LayoutProps) => (
  <PublicSiteChrome footer>{children}</PublicSiteChrome>
);
