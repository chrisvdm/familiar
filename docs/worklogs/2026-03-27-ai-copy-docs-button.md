# 2026-03-27 AI Copy Docs Button

- added an AI-ready documentation payload for copying from the public docs
- added a `Copy for AI` button to the docs chrome
- added a preview page at `/docs/ai-copy` so the copied payload can be inspected in the browser
- wrote the AI payload to be concise, technical, and structured for direct model consumption without marketing language
- kept the feature inside the static docs surface using a small inline clipboard script instead of adding a heavier client runtime
