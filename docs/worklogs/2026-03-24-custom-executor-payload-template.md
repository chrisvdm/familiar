# 2026-03-24 Custom Executor Payload Template

- added optional `executor_payload` support to synced tool definitions
- _familiar_ now uses the tool's custom payload template when calling `/tools/execute`
- kept the existing wrapped request body as the default when no custom template is defined
- updated the user docs to describe the default payload as a default, not a required universal contract
