# 2026-03-13 Assistant Markdown Rendering

## Scope

- Render assistant messages as markdown in the web chat UI.
- Support the common markdown cases needed for chat responses without adding a new dependency.

## Completed

- Added a lightweight client-side assistant markdown renderer for:
  - paragraphs
  - unordered lists
  - ordered lists
  - fenced code blocks
  - inline code
  - bold text
  - italic text
  - links
- Kept user messages as plain text so only assistant responses receive markdown formatting.
- Added minimal markdown styling for code, links, lists, and paragraph spacing.

## Notes

- This is intentionally a lightweight renderer, not a complete markdown implementation.
- List rendering depends on actual line breaks from the model output; the renderer does not try to infer inline list structure heuristically.
- If richer markdown support becomes important later, this can be replaced with a dedicated markdown library once the product architecture settles.
