# 2026-03-13 Web UI Redesign

## Scope

- Restyle the web chat interface to match the new split-pane mockup.
- Bring back a lightweight visible thread list without removing the command-driven thread controls.
- Make pending assistant replies look provisional instead of like completed responses.

## Completed

- Reworked the web UI into a two-column layout with:
  - a left thread rail
  - a compact `texty.` header
  - a `+ New` thread control
  - a plain main chat pane with a minimal model label
- Kept the existing thread command system intact while restoring click-to-switch thread navigation in the sidebar.
- Styled assistant replies as plain text blocks and kept the user message as the only organic bubble.
- Added a temporary `working` state for pending assistant messages with muted styling and animated dots.
- Added thread metadata in the sidebar so private threads and short thread ids are visible without opening the command list.
- Turned `+ New` into a menu with separate normal and private thread actions.
- Moved thread rename/delete behind right-click context actions instead of persistent visible controls.
- Replaced the static model label with a real model selector and persisted the selected model in the browser session.

## Notes

- The sidebar is now a convenience layer on top of the same thread actions already used by commands.
- On smaller screens the sidebar collapses away and the command system remains available through the composer.
- The thread rail now shows only thread names in its default state; secondary actions are intentionally hidden until requested.
