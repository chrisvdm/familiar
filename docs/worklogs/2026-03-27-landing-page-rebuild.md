# 2026-03-27 Landing Page Rebuild

- rebuilt the root landing page around a full-page structure instead of a single hero and example cards
- moved the landing page into `src/app/pages/home/` with a dedicated `index.tsx` and `home.css`
- updated the root route and static document to use the new landing page module and stylesheet
- rewrote the landing-page copy to be clearer, less repetitive, and easier for a junior developer to understand without product jargon
- added a sticky top navigation that shrinks on scroll and keeps the logo visible
- adjusted section sizing and spacing so the page reads in larger viewport-sized sections
- tightened the docs/footer transition so the docs section and footer can appear together
- kept the page aligned with the provided logo, palette, and reference layout direction without turning it into a marketing page
