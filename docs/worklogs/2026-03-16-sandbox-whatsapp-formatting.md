# 2026-03-16 Sandbox WhatsApp Formatting

## Scope

- Make the sandbox messenger render WhatsApp-style inline text formatting instead of generic markdown assumptions.

## Completed

- Added WhatsApp-style inline formatting support in the sandbox messenger for:
  - `*bold*`
  - `_italic_`
  - `~strikethrough~`
  - `` `monospace` ``
- Preserved line breaks so multi-line transport-style messages render more naturally.
- Added matching monospace styling for inline backtick segments in the sandbox UI.

## Notes

- This is intentionally transport-specific formatting for the sandbox messenger and does not change the main web chat renderer.
