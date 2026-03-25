# 2026-03-25 CLI Default Hosted URL

- changed the CLI default base URL from local localhost development to the deployed hosted `_familiar_` URL
- removed unnecessary `--host` usage from the main hosted docs examples
- kept `--host` as an override for alternate environments
- motivation: the normal product path is hosted usage, so the CLI should default to the hosted service instead of making users specify the obvious host every time
