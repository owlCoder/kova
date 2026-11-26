# @kova/webview

React + TypeScript + Vite agent panel for the Kova VS Code sidebar and editor views. It renders a transcript (messages with inline tool rows and lifecycle notes), an inline permission prompt, a working indicator and a composer with permission modes, context and model controls. Styling follows VS Code theme variables. The extension host owns the agent session; the UI receives JSON snapshots/events and sends validated intents through `@kova/protocol`.

React owns rendering state only. It cannot execute tools, classify risk, grant policy permissions or contact model endpoints directly. Markdown disables raw HTML and remote images. VS Code uses its native webview bridge and a nonce CSP.

See [protocol](../docs/PROTOCOL.md).
