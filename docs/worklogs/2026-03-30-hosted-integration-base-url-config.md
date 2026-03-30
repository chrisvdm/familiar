# 2026-03-30 Hosted Integration Base URL Config

- added token-authenticated hosted integration config storage for the current setup
- added `GET /api/v1/integration` to read the current integration config
- added `PATCH /api/v1/integration` to set or clear the executor `base_url`
- wired token-authenticated tool execution to use the stored integration `baseUrl`
- documented the new hosted API path in quickstart and API reference

Result:

- a hosted token-backed setup can now store a public executor base URL such as a tunnel endpoint
- *familiar* will call `POST {base_url}/tools/execute` for tool execution on that hosted setup
