# Architecture Decision Records

All decisions are **Proposed**. Accept them through the architecture review before implementing the runtime. A later ADR supersedes an accepted decision; do not silently rewrite its rationale.

| ADR                                         | Decision                                                         |
| ------------------------------------------- | ---------------------------------------------------------------- |
| [001](001-package-boundaries.md)            | Inward dependencies and a neutral protocol package               |
| [002](002-provider-and-cancellation.md)     | Provider-independent streaming and cancellation                  |
| [003](003-context-and-conversation.md)      | Explicit 8K budget, bounded history and deterministic compaction |
| [004](004-tool-preparation-and-approval.md) | Prepared tool calls, editor edits and approval binding           |
| [005](005-policy-hooks-guardrails.md)       | Four modes; hooks veto; final guardrails only tighten            |
| [006](006-skills-and-mcp.md)                | Selected skills; stdio MCP as normal tools                       |
| [007](007-event-driven-webview.md)          | Host-owned state and versioned JSON message protocol             |
| [008](008-accepted-risks.md)                | No workspace-trust prompt and explicit accepted risks            |
| [009](009-testing-and-delivery.md)          | Architectural fitness tests and incremental acceptance gates     |
