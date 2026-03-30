# 2026-03-30 Public Page Layout And Setup Spacing

- moved shared public-page chrome into reusable components:
  - `src/app/components/public-site-nav.tsx`
  - `src/app/components/public-site-footer.tsx`
  - `src/app/components/public-site-chrome.tsx`
- added `src/app/layouts/public-layout.tsx` and routed `setup` through a RedwoodSDK layout instead of duplicating public nav and footer markup
- kept the landing page as its own page structure and reverted it away from the shared public layout after confirming that `/` should remain separate from the docs and setup page layout path
- updated the public-page nav treatment so the sticky nav background spans the full viewport width instead of being constrained by the content shell
- aligned the standalone public example pages with the public site theme, nav, and footer
- moved setup-page styling into the shared public stylesheet so the setup route no longer depends on a separate CSS module
- removed the setup-page "Why this path" block, commented out the "CLI direction" block, and tightened vertical spacing so more of the setup content sits above the fold
