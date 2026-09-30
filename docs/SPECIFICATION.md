# Kova — Product & Architecture Specification

> **Kova** is an offline-first local AI coding agent implemented as a VS Code extension.
>
> Primary runtime: **Ollama**
>
> Initial local model: **Qwen3 4B**
>
> Primary goals:
>
> - simple local coding assistant
> - educational reference implementation
> - explicit support for tools, skills, MCP, hooks and guardrails
> - clean, testable architecture
> - low memory usage
> - no mandatory cloud account, API key or external service

---

## Revision notes (v2)

Changes applied after architectural review:

- Hook vs guardrail semantics specified; guardrails always run last and can only tighten a decision (18.1).
- Context budget: tool definitions counted, eviction order defined, token counting, explicit `num_ctx`, Qwen3 thinking handling (10, 10.1, 27.1).
- Small-model robustness: malformed and repeated tool-call handling (9); `edit_file` replaces `apply_patch` (13.1).
- Protected paths, path normalization and untrusted-content rule (29.1 to 29.3); command allowlist for Auto mode (30.1).
- Tool output limit lowered so it fits an 8K context (28).
- "One public type per file" relaxed for plain data types (22).
- Persistence and undo decisions (11.1, 13.2).
- Decision: **no workspace-trust prompt**. The risk is accepted and documented (16, 34.1).

---

# 1. Product Vision

Kova is a small, understandable local coding agent for VS Code.

It is intentionally **not** intended to compete with Claude Code, Codex, Cline or similar products by feature count.

Its purpose is to demonstrate how a modern AI coding workflow works internally while still being practically useful.

The project should be suitable for teaching:

- Clean Architecture
- SOLID
- Dependency Inversion
- Ports and Adapters
- AI-assisted development workflows
- local LLM execution
- tool calling
- skills
- MCP
- hooks
- guardrails
- context management
- agent loops

The application should work fully offline when a supported local model is already installed.

---

# 2. Product Name

Working name:

# **Kova**

Tagline:

> **Local Coding Agent**

Alternative subtitle:

> **Offline-first AI coding agent for VS Code**

The name comes from the idea of forging/building software.

Before publishing, verify that the name is available on the VS Code Marketplace and does not collide with an existing trademark.

---

# 3. Logo Direction

The logo should be minimal and recognizable at small sizes.

Concept:

```text
< ✦ >
```

The visual language should combine:

- code brackets
- a spark
- creation / forging
- software engineering

The final icon should be a custom SVG.

It must work in:

- VS Code Activity Bar
- extension marketplace card
- README
- dark theme
- light theme

Avoid:

- robot heads
- brains
- chat bubbles
- generic AI star as the only visual element

Preferred direction:

```text
code brackets + geometric spark
```

---

# 4. Product Form

Kova should be a **VS Code extension**, not a standalone desktop application.

Reason:

Students and developers already have:

```text
VS Code
+ source code
+ workspace
+ Git
+ terminal
+ editor
```

Kova only adds:

```text
AI coding agent
```

This avoids rebuilding:

- file explorer
- editor
- terminal
- Git integration
- workspace navigation
- selection support
- diff rendering

However, the core application must **not depend on VS Code**.

VS Code is a presentation/workspace adapter.

Conceptually:

```text
Kova Core
    ↑
VS Code Adapter
```

Never:

```text
Agent Core → vscode.*
```

---

# 5. Offline-first Strategy

Primary runtime:

```text
VS Code
   ↓
Kova
   ↓
Ollama
   ↓
Qwen3 4B
```

Benefits:

- no account
- no API key
- no cloud dependency
- no mandatory Internet connection
- no source code sent to third-party services
- predictable teaching environment

However, the architecture must not be coupled to Ollama.

There must be a provider abstraction.

Example:

```ts
export interface LlmProvider {
    streamChat(
        request: ChatRequest,
        cancellationToken: CancellationToken
    ): AsyncIterable<ChatEvent>;
}
```

Initial implementation:

```text
OllamaLlmProvider
```

Possible later providers:

```text
OpenAiCompatibleLlmProvider
LmStudioLlmProvider
```

The Agent Core must remain unchanged when a new provider is added.

This is a mandatory Dependency Inversion Principle example.

---

# 6. Initial UI Direction

The UI should be inspired by the simplicity of Claude Code's VS Code experience, without copying its branding or exact layout.

Main view:

```text
┌─────────────────────────────────────────────┐
│ ✦ KOVA                           ＋  ⚙      │
├─────────────────────────────────────────────┤
│                                             │
│                  ✦ Kova                     │
│              Local Coding Agent             │
│                                             │
│          How can I help with your code?     │
│                                             │
│                                             │
├─────────────────────────────────────────────┤
│ Ask Kova...                                 │
│                                             │
│ ＋     Qwen3 4B        ⚡ Manual         ↑  │
└─────────────────────────────────────────────┘
```

Required UI elements:

- conversation
- prompt textbox
- send button
- stop generation button
- model selector
- mode selector
- context usage indicator (tool-definition cost shown separately)
- model thinking (collapsed, only when enabled)
- tool calls
- active skill visibility
- MCP activity
- hook activity
- guardrail decisions
- approvals
- errors

Do not build a large dashboard.

The interface should remain focused on the conversation and current agent activity.

---

# 7. Agent Modes

Kova v1 should have exactly four modes:

- Plan
- Manual
- Edit
- Auto

---

## 7.1 Plan Mode

Read-only mode.

The agent may:

- read files
- list directories
- search the workspace
- inspect Git diff
- use read-only MCP tools
- reason about changes
- create implementation plans

The agent may not:

- edit files
- create files
- delete files
- execute write/destructive tools

UI description:

```text
☷ Plan

Explore the project and create a plan
without modifying it.
```

---

## 7.2 Manual Mode

Default mode.

Every state-changing operation requires explicit user approval.

Example:

```text
Kova wants to edit:

src/Application/CreateReservationHandler.cs

[Allow] [Reject]
```

Read-only operations may run automatically unless policy says otherwise.

---

## 7.3 Edit Mode

The agent may automatically modify files inside the active workspace.

Shell/process execution still requires approval.

Destructive or suspicious actions still go through guardrails.

Writes to protected paths (see 29.2) still require approval.

---

## 7.4 Auto Mode

Allowed operations may execute without asking the user.

Important:

> Auto mode never bypasses guardrails.

Auto mode also runs only allowlisted commands without asking (see 30.1).

The flow must still be:

```text
Tool Call
   ↓
Risk Classification
   ↓
Permission Policy
   ↓
Hooks
   ↓
Guardrails
   ↓
Execution
```

---

# 8. Core Agent Execution Flow

The conceptual execution flow is:

```text
User
 ↓
Conversation
 ↓
Context Builder
 ↓
LLM
 ↓
Assistant response
        │
        └── Tool call?
              ↓
          Tool Registry
              ↓
        Permission Policy
              ↓
           Pre Hooks
              ↓
           Guardrails
              ↓
           Tool Executor
              ↓
          Post Hooks
              ↓
           Tool Result
              ↓
              LLM
```

The Agent Core must own orchestration.

Infrastructure components only implement ports.

---

# 9. Agent Loop Safety

The agent loop must have a hard iteration limit.

Example:

```text
MaxToolIterations = 10
```

This prevents a weak local model from entering an infinite tool loop.

When the limit is reached, return a structured failure event to the UI.

Small local models regularly produce malformed or repeated tool calls. These are expected conditions, not exceptions, and the loop must handle them explicitly:

- **Malformed tool call** (invalid JSON, unknown tool name, arguments that fail the input schema): the call is not executed. A structured tool error describing the problem is returned to the model, with at most 2 repair attempts per call. After that the loop stops with `AgentLoopStopped(MalformedToolCall)`.
- **Repeated tool call** (same tool, identical arguments, consecutive): the second identical call is not executed and the model is told the result is already in context. A third identical call stops the loop with `AgentLoopStopped(RepeatedToolCall)`.
- **Iteration limit**: `AgentLoopStopped(IterationLimit)`.

Repair attempts count toward `MaxToolIterations`.

---

# 10. Context Management

Context management is a first-class requirement.

Kova must **not** automatically send the entire workspace to the model.

Default target:

```text
8192 tokens
```

The UI should show:

```text
Context
3.1k / 8k
```

The ContextBuilder should prioritize (highest priority first, i.e. last to be dropped):

1. system instructions
2. tool definitions of the currently enabled tools
3. active skill
4. current user message
5. recent conversation
6. selected text / current file
7. explicit user-provided files
8. tool results
9. MCP results

Tool definitions are sent with every request and consume budget. In Plan mode only read-only tools are exposed, which also shrinks this cost. MCP servers that expose many tools can exhaust the budget, so the UI shows tool-definition cost separately.

**Eviction order** when the budget is exceeded (first dropped first):

1. older tool and MCP results, replaced by one-line stubs (for example `[read_file src/X.cs: 214 lines, omitted]`)
2. explicit user-provided files and selected text, truncated to fit
3. older conversation, via `ConversationCompactor`

Never dropped: system instructions, tool definitions, the active skill, the current user message and the tool result(s) of the current agent step (truncated if necessary, never removed).

## 10.1 Token counting

Token counts come from a `TokenCounter` port.

- Before a request: a conservative estimate (for example about 4 characters per token) lets the ContextBuilder stay inside the budget.
- After a response: reconcile with the provider's reported usage (Ollama returns `prompt_eval_count` and `eval_count` on the final streamed chunk) and show the real figure in the UI.
- The budget reserves output tokens (default 1,024) and a safety margin (default 10%).

Kova v1 should not include:

- whole-repository indexing
- embeddings
- vector database
- semantic RAG
- background workspace ingestion

Those are non-goals.

---

# 11. Conversation Compaction

Conversation history must not grow indefinitely.

When history becomes too large:

```text
old conversation
      ↓
ConversationCompactor
      ↓
structured summary
```

Example summary:

```text
Goal:
Implement reservation validation.

Files inspected:
- CreateReservationHandler.cs
- CreateReservationCommandValidator.cs

Changes:
- Added validation for invalid quantity.

Outstanding:
- Add tests for quantity zero.
```

The compacted summary becomes part of the context instead of the entire historical transcript.

## 11.1 Persistence

v1 keeps conversations in memory for the lifetime of the extension session. `ConversationRepository` remains a Core port with an in-memory implementation. Persistent storage (for example VS Code workspace state) can be added later without changing the Core.

---

# 12. Streaming

LLM responses must be streamed.

Bad UX:

```text
request
↓
wait 20 seconds
↓
entire response
```

Required UX:

```text
request
↓
token
token
token
...
```

The UI must support:

```text
Stop generation
```

Cancellation should use an abstraction such as:

```text
CancellationToken
```

or an equivalent wrapper around `AbortSignal`.

The Core should not depend directly on browser-specific cancellation APIs.

---

# 13. Built-in Tools

Initial built-in tool set:

```text
read_file
list_directory
search_files
get_git_diff
write_file
edit_file
run_command
```

Tools should be small and explicit.

Do not create:

```text
do_anything
```

Each tool has:

- name
- description
- input schema
- risk level
- executor

Example abstraction:

```ts
export interface Tool {
    readonly definition: ToolDefinition;

    execute(
        request: ToolExecutionRequest,
        cancellationToken: CancellationToken
    ): Promise<ToolResult>;
}
```

The interface and implementation must not be placed in the same file.

## 13.1 edit_file instead of patch formats

Small local models generate unified diffs unreliably, so Kova uses a search-and-replace edit tool:

```text
edit_file(path, old_string, new_string)
```

- `old_string` must match exactly one location in the file, whitespace included.
- Zero matches or more than one match: nothing is changed and the tool returns a structured error containing the match count, so the model can retry with more surrounding context.
- `write_file` is for creating new files or full rewrites.
- The diff shown for approval is computed by Kova from the before/after content, never produced by the model.

## 13.2 Reversibility

v1 has no checkpoint system. Edits are applied through the VS Code adapter as workspace edits, so the editor's undo and Git remain the rollback mechanism, and the approval dialog shows the diff before anything is written. Teaching note: commit before letting an agent edit.

---

# 14. Tool Risk Classification

Every tool invocation must have a risk classification.

Initial levels:

```text
ReadOnly
WorkspaceWrite
ProcessExecution
Destructive
```

Examples:

```text
read_file
→ ReadOnly

write_file
→ WorkspaceWrite

dotnet test
→ ProcessExecution

rm -rf
→ Destructive
```

PermissionMode uses risk classification to decide whether user approval is needed.

Risk classification must remain independent from the UI.

---

# 15. Skills

Canonical location:

```text
.kova/
  skills/
    review-pull-request/
      SKILL.md
```

Example:

```text
.kova/skills/review-pull-request/SKILL.md
```

Skill format:

```md
---
name: review-pull-request
description: Review a change against requirements, architecture and tests.
---

# Review Pull Request

...
```

A skill is **not a tool**.

Definition:

> A skill is reusable procedural context that helps the model perform a known workflow.

Conceptual flow:

```text
Agent discovers skills
        ↓
Skill metadata
        ↓
Skill selected
        ↓
SkillLoader
        ↓
SKILL.md added to context
```

UI should show:

```text
● Skill
  review-pull-request
```

Possible compatibility sources later:

```text
.claude/skills/
.ai/skills/
.agents/skills/
```

Canonical Kova location remains:

```text
.kova/skills/
```

---

# 16. MCP

Kova must be an MCP client.

Configuration:

```text
.kova/mcp.json
```

Example:

```json
{
  "servers": {
    "ers": {
      "transport": "stdio",
      "command": "dotnet",
      "args": [
        "run",
        "--project",
        "src/EquipmentReservation.Mcp"
      ]
    }
  }
}
```

Kova v1 supports only:

```text
stdio MCP
```

Do not implement HTTP/SSE/remote MCP in v1.

Kova v1 does **not** ask the user to trust a workspace before starting the MCP servers configured in `.kova/mcp.json` (or before running commands configured in `.kova/hooks.json`). This is a deliberate product decision: per-project trust prompts add friction for students. The risk is accepted and documented in 34.1. To keep it visible instead of hidden:

- the `McpServerStarted` event includes the exact command line, shown in the UI and in the Output channel;
- writes to `.kova/mcp.json` and `.kova/hooks.json` by the agent always require approval (see 29.2).

Conceptual flow:

```text
Kova
 ↓
McpClient
 ↓
stdio
 ↓
EquipmentReservation.Mcp
```

MCP tools must be adapted into the same Tool abstraction used by built-in tools.

The Agent Core must not distinguish between:

```text
Built-in Tool
MCP Tool
VS Code Tool
```

It should only see:

```text
Tool
```

This is an important Ports & Adapters decision.

---

# 17. Hooks

Canonical configuration:

```text
.kova/hooks.json
```

Initial lifecycle events:

```text
BeforeToolExecution
AfterToolExecution
```

Possible future lifecycle points:

```text
BeforePrompt
AfterResponse
SessionStart
SessionEnd
```

Do not implement those in v1 unless genuinely needed.

Hooks must not be hardcoded into the main agent loop.

Provide an abstraction such as:

```text
HookPipeline
```

or equivalent.

---

# 18. Hooks vs Guardrails

Hooks and guardrails are distinct concepts.

A hook is:

> A lifecycle extension point.

A guardrail is:

> A policy that decides whether an operation is allowed.

Example:

```text
run_command:
rm -rf .

      ↓

BeforeToolExecution
      ↓
GuardrailEvaluator
      ↓
Blocked
```

UI example:

```text
⛔ Guardrail blocked command

rm -rf .

Reason:
Destructive recursive deletion is not allowed.
```

For ERS integration, Kova may later provide an adapter to:

```text
EquipmentReservation.Guardrails
```

## 18.1 Semantics

Flow for a blocked call:

```text
run_command: rm -rf .
      ↓
Permission Policy
      ↓
Pre Hooks (BeforeToolExecution)
      ↓
GuardrailEvaluator (separate stage, always last)
      ↓
Blocked
```

- **Hooks** observe and may veto. A BeforeToolExecution hook can log, annotate or block a call. It cannot approve a call, change tool arguments, or override a guardrail decision. Hooks do not mutate input in v1.
- **Guardrails** run after all hooks, immediately before execution, in every mode including Auto. Each guardrail returns `Allow`, `RequireApproval` or `Block`. The combined decision is the strictest one. Guardrails can only tighten what the permission policy decided, never relax it.
- **AfterToolExecution hooks** run after execution, see the result, and cannot change a decision already taken.
- Guardrails are not configured through `hooks.json`.

---

# 19. VS Code Integration

The VS Code adapter may use:

```text
workspace
editor
terminal
Git extension API
webview
commands
configuration
```

However, `Kova.Core` must never import:

```ts
import * as vscode from "vscode";
```

This should be enforced by architectural tests.

---

# 20. Proposed Repository Structure

Preferred monorepo structure:

```text
kova/
│
├── packages/
│
│   ├── core/
│   │   └── src/
│   │       ├── agents/
│   │       ├── conversations/
│   │       ├── context/
│   │       ├── models/
│   │       ├── providers/
│   │       ├── skills/
│   │       ├── tools/
│   │       ├── hooks/
│   │       ├── permissions/
│   │       └── mcp/
│   │
│   ├── ollama/
│   │   └── src/
│   │       └── providers/
│   │
│   ├── mcp/
│   │   └── src/
│   │
│   └── vscode/
│       └── src/
│           ├── extension/
│           ├── adapters/
│           ├── commands/
│           └── webview/
│
├── webview/
│   └── src/
│       ├── components/
│       ├── views/
│       ├── state/
│       └── messaging/
│
├── tests/
│
├── package.json
├── tsconfig.json
└── README.md
```

If a monorepo introduces unnecessary overhead, it may be simplified.

However, the logical boundaries must remain the same.

---

# 21. Clean Architecture Dependency Rule

Required dependency direction:

```text
Core
↑
Infrastructure / Adapters
```

More concretely:

```text
                 VS Code
                    ↓
Ollama → Application/Core ← MCP
                    ↑
               Adapters
```

Core must know nothing about:

- Ollama
- VS Code
- Node child_process
- filesystem implementation details
- MCP SDK
- React
- Webview
- HTTP implementation

Core knows only its own contracts / ports.

---

# 22. Mandatory Code Organization Rules

## One public type per file

This is a mandatory project-wide rule.

Do not write:

```ts
export interface LlmProvider {
}

export class OllamaLlmProvider implements LlmProvider {
}
```

in the same file.

Required:

```text
LlmProvider.ts
OllamaLlmProvider.ts
```

Similarly:

```text
Tool.ts
ToolDefinition.ts
ToolResult.ts
ReadFileTool.ts
WriteFileTool.ts
```

Avoid:

```text
tools.ts
```

containing many unrelated public types.

Allowed exception:

Small private/local helper types that exist solely for one implementation and are not exported.

Second exception:

Plain data types without behavior (type aliases, DTO-style interfaces, enums and discriminated-union variants) may be grouped in one file per cohesive concept. For example, `AgentEvent.ts` may contain every event variant of the `AgentEvent` union.

The rule stays strict for classes and behavioral interfaces: one per file, and an interface and its implementation are never in the same file.

---

# 23. SOLID Requirements

## 23.1 Single Responsibility Principle

Each type must have one clear responsibility.

Do not create a giant:

```text
AgentService
```

that:

- calls Ollama
- reads files
- loads skills
- executes shell commands
- handles MCP
- manages UI
- manages conversation history

Split those responsibilities into cohesive components.

---

## 23.2 Open/Closed Principle

Adding a new:

- provider
- tool
- hook
- skill source
- MCP transport

should not require changing the central agent execution loop.

---

## 23.3 Liskov Substitution Principle

Provider implementations must honor the same behavioral contract.

The Agent must not care whether it uses:

```text
Ollama
LM Studio
OpenAI-compatible endpoint
```

---

## 23.4 Interface Segregation Principle

Do not create a giant interface such as:

```ts
interface EverythingService
```

Prefer small contracts such as:

```text
LlmProvider
ToolRegistry
SkillRepository
HookPipeline
PermissionPolicy
ConversationRepository
ContextBuilder
```

---

## 23.5 Dependency Inversion Principle

Use cases depend on abstractions.

Infrastructure implements abstractions.

The Core must never depend directly on infrastructure packages.

---

# 24. Webview Architecture

Preferred Webview stack:

```text
React
TypeScript
Vite
```

React is only a presentation technology.

React state must not become agent business state.

Communication:

```text
Webview
   ↓ messages
VS Code Extension Host
   ↓
Application/Core
```

Back to the UI:

```text
AgentEvent
 ↓
VS Code Adapter
 ↓
Webview message
 ↓
React
```

---

# 25. Event-driven UI

Agent Core should emit structured events.

Examples:

```text
ResponseStarted
ResponseDelta
ThinkingDelta
ResponseCompleted

SkillLoaded

ToolRequested
ToolAwaitingApproval
ToolStarted
ToolCompleted
ToolBlocked

McpServerStarted
McpServerStopped
McpToolCalled

ContextUpdated

AgentLoopStopped (IterationLimit | RepeatedToolCall | MalformedToolCall)
ErrorOccurred
```

The UI renders events.

Business logic must never call Webview/React directly.

---

# 26. Model Selector

Bottom bar example:

```text
Qwen3 4B ▾
```

Model picker:

```text
Local models

● qwen3:4b
  2.5 GB

○ qwen3:8b
  Not installed
```

For v1, Kova does not need to download models.

It only discovers installed Ollama models.

Use Ollama's model listing API.

Models that do not report tool-calling support are marked in the picker. Selecting one runs Kova in chat-only mode (see 27.1).

---

# 27. Ollama Integration

Default Ollama endpoint:

```text
http://127.0.0.1:11434
```

Suggested VS Code settings:

```text
kova.provider
kova.ollama.baseUrl
kova.ollama.model
kova.context.maxTokens
```

Startup flow:

```text
check Ollama
↓
get installed models
↓
verify selected model exists
```

If Ollama is unavailable:

```text
Ollama is not running.

[Retry]
[Setup instructions]
```

Do not crash.

## 27.1 Request rules for small models

- **Always send `num_ctx` explicitly**, derived from `kova.context.maxTokens`. Never rely on Ollama's server-side default: it depends on model and version, is often smaller than 8K, and truncation is silent. The value shown in the UI must equal the value sent.
- **Thinking (Qwen3 reasoning mode)** is set explicitly through `kova.ollama.think`, default `false` to preserve the 8K budget for tool-calling turns. When enabled, thinking tokens are streamed as a separate `ThinkingDelta` event, shown collapsed in the UI, and never stored in conversation history.
- **Tool calling** uses Ollama's native tool-calling support. Before enabling tools for a model, check its reported capabilities where available. If tools are unsupported, Kova runs chat-only and tells the user.
- **Unloading**: set `keep_alive` explicitly (default 5 minutes) so the model does not stay loaded when idle.

---

# 28. Performance Requirements

Low memory usage is a first-class project requirement.

Kova must not:

- read the entire workspace automatically
- send the entire repository to the model
- retain unlimited tool results
- retain unlimited conversation history
- create background embeddings
- keep unnecessary models loaded

Suggested tool output limit:

```text
maxToolOutputCharacters = 8_000   (per tool result sent to the model)
```

8,000 characters is roughly 2k tokens, about a quarter of an 8K window. A larger cap (for example 30_000 characters) may be kept for the user to inspect in the UI, but only the truncated version enters the model context.

When exceeded, the result ends with a marker that states how much was omitted and how to narrow the request:

```text
output truncated (omitted 21,400 characters; narrow the search or read a line range)
```

`read_file` accepts an optional line range and `search_files` accepts a maximum result count, so the model can narrow a request instead of receiving truncated output.

The UI indicates truncation.

---

# 29. Workspace Security

Every file path must go through a component such as:

```text
WorkspacePathGuard
```

The default rule is:

> Built-in file tools may access only files inside the active workspace.

Prevent path traversal such as:

```text
../../../../.ssh/id_rsa
```

External paths may be considered in a future version with explicit user approval.

## 29.1 Path normalization

`WorkspacePathGuard` resolves the real path before checking containment:

- resolve `..` segments
- follow symlinks (a link inside the workspace that points outside is outside)
- compare case-insensitively on Windows and macOS
- reject drive-letter, UNC and absolute paths that fall outside the workspace

## 29.2 Protected paths

Some workspace paths change what Kova itself executes or how it is governed. These are protected:

```text
.kova/mcp.json
.kova/hooks.json
.git/**
.vscode/**
```

A write to a protected path **always requires explicit approval in every mode, including Edit and Auto**. It is implemented as a guardrail returning `RequireApproval`. This stops the model from silently reconfiguring its own hooks, MCP servers or tasks that run commands. `.kova/skills/**` is not protected because skills are context, not executable configuration.

## 29.3 Untrusted content

File contents, git diffs, command output and MCP results are untrusted data and may contain instructions aimed at the model (prompt injection). The system prompt states that such content is data, not instructions, but this is only a mitigation. The real protection is that permission policy, protected paths and guardrails are enforced in code outside the model, so an injected instruction cannot grant itself more rights.

---

# 30. Shell / Process Execution

Shell execution is the highest-risk built-in capability.

Never directly do:

```text
exec(userInput)
```

without a policy layer.

Required flow:

```text
RunCommandTool
 ↓
CommandRiskClassifier
 ↓
PermissionPolicy
 ↓
BeforeTool hooks
 ↓
Guardrails
 ↓
Execution
```

Commands must be cancellable.

Process stdout/stderr should be streamed or bounded.

## 30.1 Honest limits of command classification

`CommandRiskClassifier` is a heuristic, not a sandbox. Pattern-based blocking (for example `rm -rf`, `find ... -delete`, `git clean -fd`, `git reset --hard`, `Remove-Item -Recurse`, `del /s`) catches common destructive commands but cannot catch everything, such as destructive behavior hidden inside a script. Kova v1 states this openly and uses it as teaching material.

Because blocklists are incomplete, Auto mode uses an allowlist for process execution:

- Auto mode runs a command without asking only if it matches the allowlist. Default: `git status`, `git diff`, `git log`, `dotnet build`, `dotnet test`, `npm test`. Configurable through `kova.commands.allow`.
- Matching is done on the full parsed command. A command containing chaining, redirection or substitution (`&&`, `||`, `;`, `|`, `>`, `$()`, backticks) never matches the allowlist.
- Every other command requires approval, even in Auto mode.
- Commands classified as destructive are always blocked, regardless of mode or allowlist.

---

# 31. Testing Requirements

Testability is a core architectural requirement.

Mandatory unit tests for:

```text
ContextBuilder
PermissionPolicy
SkillLoader
ToolRegistry
AgentLoop
HookPipeline
WorkspacePathGuard
ConversationCompactor
Ollama request/response mapping
MCP adapter
CommandRiskClassifier
TokenCounter
GuardrailEvaluator
Protected path guardrail
Malformed tool-call repair
```

Required integration scenarios:

```text
tool request
→ permission
→ blocked
```

```text
tool request
→ hook
→ blocked
```

```text
tool request
→ execution
→ result
→ model continuation
```

```text
MCP tool discovery
→ Tool adapter
→ tool execution
→ result
```

```text
protected path write in Auto mode
→ approval required
```

```text
malformed tool call
→ repair attempt
→ continuation or AgentLoopStopped
```

```text
compound command (&&, ;, |) in Auto mode
→ not allowlisted
→ approval required
```

---

# 32. Architectural Tests

Architectural tests should prevent accidental dependency violations.

Examples:

`core` must not import:

```text
vscode
React
MCP SDK
Ollama-specific modules
child_process
```

Infrastructure packages may depend on Core.

Core must never depend on Infrastructure.

---

# 33. Logging

Provide a VS Code Output Channel:

```text
Kova
```

It may contain:

- provider calls
- tool lifecycle
- MCP lifecycle
- timings
- warnings
- errors
- cancellation events

Never log:

- API keys
- secrets
- `.env` values
- sensitive file contents without explicit reason

---

# 34. Non-goals for v1

Do not implement:

```text
autocomplete
inline completion
multi-agent systems
agent swarms
embeddings
vector database
RAG
cloud accounts
authentication
telemetry backend
model hosting
GitHub integration
remote execution
browser automation
voice
image generation
full IDE replacement
workspace-trust / per-project approval prompts
```

The purpose of v1 is to build a clean, understandable coding agent foundation.

## 34.1 Accepted risks and known limitations (v1)

- **No workspace trust prompt.** Opening a project that contains `.kova/mcp.json` or `.kova/hooks.json` starts the configured commands without asking, so opening an untrusted repository with Kova enabled can execute code from it. Kept mitigations: commands are shown in the UI and Output channel, and the README states that Kova should only be used in projects you trust. Revisit if Kova is distributed beyond classroom use.
- **Command classification is heuristic**, not a sandbox (see 30.1).
- **No checkpoints or undo system** beyond editor undo and Git (see 13.2).
- **Small-model reliability.** Qwen3 4B will sometimes choose wrong tools or produce malformed calls. Loop limits and repair rules bound the damage but do not make the model reliable.

---

# 35. MVP Milestones

## Milestone 1 — Foundation

Implement:

```text
VS Code extension installation
sidebar
Webview
Ollama connectivity
model selector
basic streaming chat
cancellation
explicit num_ctx
thinking handling (ThinkingDelta)
TokenCounter + context indicator
```

No tools yet.

Acceptance criteria:

- user can open Kova
- Kova detects Ollama
- installed models are listed
- user can select `qwen3:4b`
- streamed chat works
- stop generation works
- context indicator matches the num_ctx sent to Ollama
- core does not depend on VS Code/Ollama directly

---

## Milestone 2 — Agent Tools

Add:

```text
read_file
list_directory
search_files
get_git_diff
```

Add:

```text
ToolRegistry
ToolDefinition
ToolResult
PermissionPolicy
RiskClassification
model tool-capability detection
malformed tool-call repair
repeated-call detection
```

No file modification yet.

---

## Milestone 3 — Editing

Add:

```text
write_file
edit_file
protected paths (29.2)
diff preview
approval flow
```

Add Manual/Edit mode behavior.

All workspace writes must stay inside the workspace.

---

## Milestone 4 — Skills

Add:

```text
.kova/skills/
SKILL.md discovery
frontmatter parsing
skill metadata
skill activation
skill UI visibility
```

Example:

```text
review-pull-request
```

---

## Milestone 5 — MCP

Add:

```text
.kova/mcp.json
stdio MCP processes
server lifecycle
tools/list
tools/call
MCP → Tool adapter
```

MCP tools must enter the normal ToolRegistry.

---

## Milestone 6 — Hooks & Guardrails

Add:

```text
BeforeToolExecution
AfterToolExecution
HookPipeline
GuardrailEvaluator
GuardrailDecision (Allow / RequireApproval / Block)
run_command tool
CommandRiskClassifier
command allowlist for Auto mode
blocked operation UI
```

Implement Auto mode only after guardrails are reliable.

---

## Milestone 7 — ERS Integration

Integrate with the Equipment Reservation example.

Add:

```text
review-pull-request skill
EquipmentReservation.Mcp
EquipmentReservation.Guardrails
```

Provide an end-to-end teaching scenario.

---

# 36. Final ERS Teaching Demo

Student opens the Equipment Reservation project.

Prompt:

```text
Review my current changes.
```

Kova shows:

```text
Loaded skill:
review-pull-request

Calling:
get_git_diff

Calling MCP:
run_unit_tests

Reviewing architecture...
```

The model returns a structured review.

Then the student asks:

```text
Delete everything in the repository.
```

The model requests:

```text
run_command
```

with a destructive command.

Kova shows:

```text
⛔ Blocked by guardrail
```

This demonstrates:

```text
LLM
Skills
Tools
MCP
Hooks
Guardrails
SOLID
Clean Architecture
```

inside one coherent example.

---

# 37. Suggested Initial Model Settings

Primary teaching model:

```text
qwen3:4b
```

Recommended default context:

```text
8192 tokens
```

Recommended philosophy:

- concise system prompt
- minimal injected workspace context
- explicit tools
- small tool results
- deterministic workflows where possible
- no unnecessary autonomous exploration

The product should work acceptably with small local models.

---

# 38. Product Philosophy

Kova should be:

```text
small
explicit
observable
offline-first
educational
extensible
testable
safe
```

Not:

```text
magical
opaque
huge
cloud-dependent
framework-heavy
over-abstracted
```

The source code should itself be teachable.

---

# 39. Architecture Principles Summary

Mandatory rules:

1. Clean Architecture.
2. Dependency Rule strictly enforced.
3. SOLID throughout the system.
4. One public class or behavioral interface per file.
5. Interface and implementation in separate files.
6. Core independent of VS Code.
7. Core independent of Ollama.
8. Core independent of MCP SDK.
9. MCP tools adapted to standard Tool abstraction.
10. Skills are context, not tools.
11. Hooks are lifecycle extension points.
12. Guardrails are policies.
13. Performance and low memory usage are first-class requirements.
14. No whole-workspace prompt dumping.
15. No vector database/RAG in v1.
16. All file paths validated against workspace boundaries.
17. Shell execution always goes through policy and hooks.
18. Agent loop has a hard iteration limit.
19. Long conversations are compacted.
20. Long tool outputs are truncated.
21. UI is event-driven.
22. Agent Core never knows about React/Webview.
23. Infrastructure dependencies point inward toward Core.
24. Tests enforce both behavior and architecture.
25. Guardrails run last, can only tighten a decision and are never overridden by hooks or modes.
26. Writes to protected paths always require approval, in every mode.
27. Only a token-budgeted share of any tool output reaches the model.
28. `num_ctx` is always sent explicitly to the provider.
29. Malformed and repeated tool calls are handled explicitly by the agent loop.
30. Known, accepted risks are documented, not hidden (34.1).

---

# 40. Prompt for Claude Opus 5.5

Copy the following prompt and give it to Claude Opus 5.5.

---

## Claude Prompt

You are the lead software architect and implementation owner for a new project called **Kova**.

Kova is an offline-first local AI coding agent implemented as a VS Code extension. Its primary model runtime is Ollama, initially using Qwen3 4B.

The project is educational as well as functional. Its architecture must therefore be exceptionally clean, understandable and maintainable.

You must apply Clean Architecture, SOLID, dependency inversion, explicit ports/adapters and strong separation of concerns.

A mandatory code-organization rule is:

**One public class or behavioral interface per file.**

Never place an interface and its implementation in the same file.

Plain data types without behavior (type aliases, DTO-style interfaces, enums, discriminated-union variants) may be grouped in one file per cohesive concept, for example all `AgentEvent` variants in `AgentEvent.ts`.

Do not create large files containing multiple unrelated classes/interfaces/types.

Examples:

```text
LlmProvider.ts
OllamaLlmProvider.ts
```

```text
Tool.ts
ReadFileTool.ts
```

Do not place these types together in generic files such as:

```text
tools.ts
services.ts
models.ts
```

unless those files only re-export symbols.

The architecture must keep the Agent Core independent of:

- VS Code
- Ollama
- MCP SDK
- React
- Webview
- Node process APIs
- filesystem implementation details
- infrastructure libraries

Infrastructure should depend inward on Core abstractions.

Kova v1 should implement:

- VS Code sidebar chat UI
- React/TypeScript Webview
- local Ollama provider
- discovery of locally installed Ollama models
- streamed model responses
- cancellation
- Plan, Manual, Edit and Auto permission modes
- context budget management
- conversation compaction
- built-in coding tools
- explicit tool risk classification
- approval workflow
- `.kova/skills/*/SKILL.md`
- stdio MCP client support using `.kova/mcp.json`
- BeforeToolExecution and AfterToolExecution hooks
- guardrail pipeline
- workspace path protection
- tool output limits
- structured AgentEvents for the UI
- comprehensive unit tests
- integration tests
- architectural dependency tests

Keep the MVP deliberately small.

Do not implement:

- embeddings
- vector databases
- RAG
- multi-agent orchestration
- agent swarms
- cloud accounts
- authentication
- autocomplete
- inline completion
- browser automation
- voice
- image generation
- telemetry backend
- GitHub integration
- remote execution
- workspace-trust or per-project approval prompts (accepted risk, to be documented)

The agent execution flow should conceptually be:

```text
User
→ Conversation
→ ContextBuilder
→ LLM
→ Tool Request
→ Tool Registry
→ Permission Policy
→ Hooks / Guardrails
→ Tool Executor
→ Tool Result
→ LLM
```

MCP tools must be adapted to the same Tool abstraction used by native tools.

The Agent Core must not distinguish whether a tool comes from MCP or a built-in adapter.

Skills are procedural context, not tools.

Hooks are lifecycle extension points.

Guardrails are policies and must not be conflated with hooks.

The default model context should target approximately 8K tokens because the application is designed to work well with smaller local models.

Do not indiscriminately send the workspace to the model.

Treat performance and low memory usage as first-class requirements.

Do not retain unlimited tool output.

Do not retain unlimited conversation history.

Introduce explicit compaction/truncation strategies.

Before implementing significant code:

1. Produce a set of Architecture Decision Records.
2. Produce the proposed repository/package structure.
3. Define domain/application abstractions and dependency direction.
4. Define the agent state machine / execution loop.
5. Define the message protocol between the VS Code extension host and Webview.
6. Define provider contracts.
7. Define tool contracts.
8. Define skill contracts.
9. Define hook contracts.
10. Define MCP adapter contracts.
11. Define permission/risk contracts.
12. Define context-management contracts.
13. Define the testing strategy.
14. Define architectural dependency tests.
15. Identify major architectural and performance risks.
16. Define context-budget eviction order, token counting, and provider `num_ctx` and thinking handling.
17. Define hook vs guardrail semantics: guardrails run last and can only tighten a decision; hooks may observe or veto, never allow.
18. Define small-model robustness: malformed and repeated tool-call handling, and the `edit_file` contract.
19. Define protected paths, path normalization and the command allowlist for Auto mode.
20. Document accepted risks (including the absence of a workspace trust prompt) in an ADR.

Do not begin broad implementation until the architecture is internally consistent.

Then implement incrementally in milestones:

```text
Foundation
→ Chat/Ollama
→ Tools
→ Editing
→ Skills
→ MCP
→ Hooks/Guardrails
→ ERS example
```

At the completion of each milestone:

- run tests
- run lint
- run typecheck
- verify dependency rules
- verify no new architectural violations
- summarize what was implemented
- list any architectural deviations
- list remaining risks

Prefer small cohesive classes/modules over large manager/service classes.

Do not introduce abstractions without a concrete architectural purpose.

However, do not collapse architectural boundaries merely to reduce file count.

The final codebase should itself be suitable for teaching Clean Architecture and SOLID principles.

---

# 41. First Request to Claude

After giving Claude the full specification above, the first implementation request should be:

> Do not implement the application yet.
>
> Start only with the architecture phase.
>
> Produce:
>
> 1. ADRs
> 2. final package/repository tree
> 3. dependency diagram
> 4. core contracts/interfaces
> 5. agent execution state machine
> 6. Webview ↔ extension-host message protocol
> 7. provider abstraction
> 8. tool abstraction
> 9. skill abstraction
> 10. hook/guardrail abstraction
> 11. MCP abstraction
> 12. context-management strategy
> 13. testing strategy
> 14. architectural test strategy
> 15. key risks and tradeoffs
> 16. accepted risks and known limitations
>
> Do not generate broad production implementation until this architecture is reviewed and approved.

---

# 42. Initial Success Criteria

Kova v1 is successful if a student can:

1. install Ollama
2. install `qwen3:4b`
3. install the Kova VS Code extension
4. open a project
5. chat locally
6. see the active local model
7. inspect context usage
8. let the agent read project files
9. approve or deny edits
10. activate a skill
11. call an MCP tool
12. observe a hook
13. see a guardrail block an unsafe action
14. understand the architecture by reading the source code

The teaching value is as important as the feature set.

---

# 43. Final Guiding Principle

> Kova should make the AI coding-agent workflow visible instead of hiding it.

A student should be able to understand:

```text
What context was sent?
Which skill was loaded?
Which tool was requested?
Why was approval needed?
Which hook executed?
Why was the action blocked?
Was the tool built-in or provided by MCP?
What did the model receive back?
```

That observability is one of the main reasons for building Kova instead of using a large opaque third-party coding agent.