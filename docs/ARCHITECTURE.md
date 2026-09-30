# Architecture baseline

Status: **Proposed — architecture review required before runtime implementation.** This delivers specification §41. Source contracts compile; adapters and application implementations described below are planned.

## Dependency direction

```mermaid
flowchart BT
  O["@kova/ollama · HTTP adapter"] --> C["@kova/core · domain / application"]
  M["@kova/mcp · stdio adapter"] --> C
  V["@kova/vscode · composition / workspace adapters"] --> C
  V --> O
  V --> M
  V --> P["@kova/protocol · JSON DTOs"]
  W["@kova/webview · React presentation"] --> P
  P -. "type-only data contracts" .-> C
```

Arrows denote imports/dependencies. Core imports only Core. Protocol imports only Core data contracts, using `import type`; it contains no classes, functions or behavioral interfaces. Webview imports only Protocol and its UI libraries. Ollama and MCP cannot import one another or VS Code. VS Code is the only composition root. Root tooling is not part of the runtime graph.

The one addition to the suggested repository is `packages/protocol`, justified by the host/UI boundary. Filesystem, process and VS Code tool adapters stay in `packages/vscode`; a separate generic infrastructure package is unnecessary at this size. No runtime dependency is installed during architecture review.

## Repository map

The current tree contains contracts, documents, package boundaries and tests. This is the final **logical** tree, including named implementations to add in later milestones:

```text
kova/
├── packages/
│   ├── core/src/
│   │   ├── common/          CancellationToken, Disposable, JsonValue
│   │   ├── agents/          Agent, AgentRequest, AgentEvent, AgentState, AgentMode
│   │   │                   [later] AgentLoop
│   │   ├── providers/       LlmProvider, ChatRequest, ChatMessage, ChatEvent
│   │   ├── models/          ModelCatalog, ModelInfo
│   │   ├── conversations/   ConversationRepository, ConversationCompactor, summaries
│   │   │                   [later] InMemoryConversationRepository, StructuredConversationCompactor
│   │   ├── context/         ContextBuilder, TokenCounter, attachments, usage and result DTOs
│   │   │                   [later] BudgetedContextBuilder, ConservativeTokenCounter
│   │   ├── tools/           Tool, ToolRegistry, ToolInputValidator, previews, calls and results
│   │   │                   [later] InMemoryToolRegistry, BoundedToolOutputLimiter
│   │   ├── skills/          Skill, SkillRepository, SkillLoader
│   │   │                   [later] FrontmatterSkillLoader
│   │   ├── permissions/     policies, risks, approvals, guardrail ports
│   │   │                   [later] ModePermissionPolicy, StrictGuardrailEvaluator,
│   │   │                           ProtectedPathGuardrail, DestructiveCommandGuardrail,
│   │   │                           DefaultToolRiskClassifier, HeuristicCommandRiskClassifier
│   │   ├── hooks/           Hook, HookPipeline, lifecycle/configuration DTOs
│   │   │                   [later] OrderedHookPipeline
│   │   ├── workspace/       reader, writer, search, path guard and Git ports
│   │   ├── processes/       ProcessRunner
│   │   └── mcp/             McpClient, stdio configuration DTOs
│   ├── ollama/src/          [later] OllamaLlmProvider, OllamaModelCatalog
│   ├── mcp/src/             [later] StdioMcpClient, McpToolAdapter
│   ├── vscode/src/
│   │   ├── extension/       [later] activate, CompositionRoot
│   │   ├── adapters/        [later] VscodeWorkspaceReader, VscodeWorkspaceWriter,
│   │   │                           VscodeWorkspaceSearch, RealWorkspacePathGuard,
│   │   │                           NodeProcessRunner, WorkspaceSkillRepository,
│   │   │                           CommandHook, VscodeApprovalPort
│   │   ├── tools/           [later] ReadFileTool, ListDirectoryTool, SearchFilesTool,
│   │   │                           GetGitDiffTool, WriteFileTool, EditFileTool, RunCommandTool
│   │   ├── commands/        [later] open/new chat, select skill, settings
│   │   └── webview/         [later] KovaViewProvider, validated message router, event projection
│   └── protocol/src/        WebviewMessage, HostMessage, SessionSnapshot,
│                           PresentationEvent, ApprovalView
├── webview/src/             [later] components/, views/, state/, messaging/
├── tests/
│   ├── architecture/        package graph, imports, code organization, Core isolation
│   ├── contracts/           compile-time protocol and capability assertions
│   ├── unit/               [later] isolated behavior tests
│   ├── integration/        [later] policy, hooks, tool continuation and MCP scenarios
│   └── fixtures/           [later] fake provider, filesystem and stdio server
├── examples/               [later] review skill, hooks, MCP configs, ERS teaching walkthrough
├── docs/                   architecture, ADRs, original specification, review, milestones
└── .github/workflows/ci.yml
```

Each public class/behavioral interface lives alone in its file. Cohesive DTOs/unions may share a file. Interfaces and implementations have separate files. Contracts use readonly JSON DTOs, ES imports with `.js` suffixes, strict typechecking and no ambient Core Node/DOM types.

## Core contracts and ownership

| Contract                                                                | Responsibility                                                       | Planned implementation/owner             |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------- |
| `Agent`                                                                 | Run orchestration; emits events, returns terminal outcome            | `AgentLoop` in Core                      |
| `LlmProvider`                                                           | Stream normalized model events                                       | Ollama package                           |
| `ModelCatalog`                                                          | Installed model and capability discovery                             | Ollama package                           |
| `ConversationRepository`                                                | Session-scoped conversation storage                                  | In-memory Core implementation            |
| `ContextBuilder` / `TokenCounter`                                       | Budget a request, compact stored history, estimate framed tokens     | Core                                     |
| `ConversationCompactor`                                                 | Deterministically summarize old complete turns                       | Core                                     |
| `Tool`                                                                  | Read-only preparation and authorized execution                       | Built-in VS Code adapters / MCP adapter  |
| `ToolRegistry`                                                          | Register unique tools; expose mode-appropriate definitions           | Core                                     |
| `ToolInputValidator`                                                    | JSON/schema validation; no model arguments execute before validation | Adapter validator injected into Core     |
| `ToolRiskClassifier` / `CommandRiskClassifier`                          | Dynamic invocation risk; parse command and detect hazards            | Core                                     |
| `PermissionPolicy`                                                      | Mode-specific baseline allow/approval/block                          | Core                                     |
| `HookPipeline` / `Hook`                                                 | Ordered lifecycle observations/vetoes                                | Core pipeline, command adapter           |
| `GuardrailEvaluator` / `Guardrail`                                      | Strictest decision, after hooks, every mode                          | Core; pluggable future ERS adapter       |
| `ApprovalPort`                                                          | Await one user decision bound to preview and invocation              | VS Code host                             |
| `WorkspacePathGuard`                                                    | Resolve platform paths and containment                               | VS Code/Node adapter                     |
| `WorkspaceReader` / `WorkspaceWriter` / `WorkspaceSearch` / `GitReader` | Explicit bounded workspace IO                                        | VS Code adapters                         |
| `ProcessRunner`                                                         | Bounded, cancellable process execution after policy                  | VS Code/Node adapter                     |
| `SkillRepository` / `SkillLoader`                                       | Discover metadata, load only selected procedural context             | Workspace adapter / Core loader          |
| `McpClient`                                                             | Start configured stdio servers and return normal tools               | MCP package                              |
| `AgentEventSink`                                                        | Observability channel; no permission authority                       | Host projection + redacted Output logger |

Provider/SDK JSON validation libraries are adapters, never Core dependencies. File tools remain in infrastructure because they perform platform IO through workspace ports; policy and orchestration remain in Core. The Core knows origin metadata for context accounting/observability, but execution is always through `Tool`, without origin-specific branches.

## Composition and lifetime

The future extension activates on opening Kova (no hidden eager repository ingestion). One selected workspace folder is the active root, including in multi-root workspaces. No folder means chat-only; tools, skills, MCP and hooks stay disabled. Folder switching cancels the active run, disposes old MCP/hook resources, clears pending approvals/attachments, and creates a folder-scoped session. The model connection can be reused, but workspace state cannot cross roots.

One run at a time per selected workspace. A busy host rejects a second submission. A run captures mode, model, active skill, context settings, configuration and tool definitions. Changes take effect on the next run, and cannot grant additional permissions during an existing run. New chat cancels the old run, removes its pending approval and starts empty history. Conversation storage lasts until extension shutdown; explicit new chat clears the active conversation.

MCP initialization and hook configuration loading happen when a workspace session is initialized. Stdio MCP commands start without an extra trust dialog. Hook programs run at their configured lifecycle event, not merely because the configuration is read. Config changes become effective at the next session/config refresh after the current run, never midway through the approving run. Agent writes to executable configs remain protected.

Adapters translate cancellation to fetch abort, VS Code tokens, pending-approval rejection and process-tree termination. Disposal terminates MCP processes and process resources. Core receives only `CancellationToken`. Cancellation callbacks must also fire for already-cancelled tokens; `throwIfCancellationRequested()` uses one recognizable cancellation error, distinguished from failure by the adapter/Core boundary.

## Application flow and UI

The host translates validated UI intent into `AgentRequest`, then calls `Agent.run`. The Agent retrieves conversation, loads selected skill, builds bounded context, streams the provider, resolves tool calls through the safety pipeline, records bounded results and continues. Tool execution is serial in v1. The host projects `AgentEvent` into safe protocol DTOs; React renders conversation, thinking, context cost, approvals and an activity list.

There is one conversation panel, with prompt, send/stop, model selector, four-mode picker and context meter. Tool definition token cost is separate. Skills, tools, MCP, hooks, guardrails and errors are visible in expandable activity rows. There is no dashboard and no React-owned business state. Diff preview uses host-side virtual documents and VS Code's diff editor.

Details: [state machine](AGENT-LOOP.md), [protocol](PROTOCOL.md), [context](CONTEXT.md), [policy](TOOLS-AND-POLICY.md), [providers](PROVIDERS.md), [integrations](INTEGRATIONS.md), [testing](TESTING.md).
