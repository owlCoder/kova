# @kova/webview

Reserved React + TypeScript + Vite presentation boundary. The UI receives JSON snapshots/events and sends intents through `@kova/protocol`. React owns rendering state only. It cannot execute tools, classify risk, grant policy permissions or contact Ollama directly.

No React/Vite runtime dependency or production component is added during architecture review. See [protocol](../docs/PROTOCOL.md).
