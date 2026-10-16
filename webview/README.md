# @kova/webview

Shared React + TypeScript + Vite presentation for Electron desktop and VS Code sidebar/editor views. The desktop shell adds project/session navigation, provider preferences, a file/diff/activity inspector and themes. Both hosts own the agent session; the UI receives JSON snapshots/events and sends validated intents through `@kova/protocol`.

React owns rendering state only. It cannot execute tools, classify risk, grant policy permissions or contact model endpoints directly. Markdown disables raw HTML and remote images. Electron uses a sandboxed preload bridge and static CSP; VS Code uses its native Webview bridge and nonce CSP.

See [protocol](../docs/PROTOCOL.md).
