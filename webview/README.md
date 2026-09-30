# @kova/webview

React + TypeScript + Vite chat UI, displayed in the Kova sidebar or an optional VS Code editor tab. Both views share the host-owned session. The UI receives JSON snapshots/events and sends intents through `@kova/protocol`. React owns rendering state only. It cannot execute tools, classify risk, grant policy permissions or contact Ollama directly.

See [protocol](../docs/PROTOCOL.md).
