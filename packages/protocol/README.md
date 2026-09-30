# @kova/protocol

Shared JSON DTOs only. This extra package prevents the Webview from importing the extension host, while keeping presentation concerns out of Core. Every dependency on Core is type-only and targets data contracts.

`WebviewMessage` carries intents. `HostMessage` carries snapshots, acknowledgments and projected agent events. `ApprovalView` references a host-owned diff preview instead of sending full before/after files to the Webview. See [protocol contract](../../docs/PROTOCOL.md).
