# 2026-03-30 Docs Copy Bundle Fix

- changed the docs AI-copy payload to generate from the real docs corpus instead of a short hardcoded summary
- updated the docs layout copy source to use a hidden textarea containing the full generated Markdown bundle
- added a clipboard fallback path using `document.execCommand("copy")`
- fixed the docs copy script to use the request CSP nonce so the browser actually executes it

Result:

- the `Copy docs content` button now copies the full current `/docs` Markdown bundle that can be given directly to an AI
