# Host ↔ UI protocol

Status: **Accepted**, version **1**. Typed source is in `packages/protocol/src`. Protocol types are self-contained with no Core imports; the host maps Core values explicitly. The host implements chat, context, skill, approval, preview and settings intents.

## Ownership

Each host owns run state, conversation repository, selected root, models, skills, context attachments, permissions and pending approvals. React owns rendering, expanded rows, input text and scroll position. Ready/reload receives an authoritative bounded snapshot. The UI cannot submit a tool call directly. Chat intents use host-owned IDs; desktop file-navigation intents carry bounded paths that the host resolves through its workspace path guard.

All inbound intents include protocolVersion and unique requestId. All host messages include protocolVersion, hostSessionId, monotonically increasing sequence and workspaceId (null without a folder). Events include runId, nullable for session/MCP lifecycle. Accepted/Rejected echo requestId. SubmitPrompt acknowledgment includes the host-created runId. Acknowledgment means accepted by the host, not completed by the model.

## Intents

| Intent                | Effect                                                                        |
| --------------------- | ----------------------------------------------------------------------------- |
| Ready                 | Negotiate version; return complete bounded Snapshot                           |
| SubmitPrompt          | Validate prompt/model/mode/skill/context IDs; capture settings; start one run |
| CancelRun             | Cancel exactly the active run                                                 |
| NewConversation       | Cancel then release current conversation and approval state                   |
| SelectSkill           | Select/clear discovered metadata; body loaded for the next run                |
| AddContext            | Host reads Selection/CurrentFile or opens file picker                         |
| RemoveContext         | Remove one host-owned attachment                                              |
| ResolveApproval       | Resolve existing run/approval/preparation-key once                            |
| OpenDiffPreview       | Open the host-owned diff for a pending file approval                          |
| RetryProvider         | Rerun model/runtime availability checks                                       |
| OpenSettings          | Open host-specific provider/preferences settings                              |
| OpenSetupInstructions | Open the bundled local setup help                                             |

Model/mode selection is part of SubmitPrompt; the host validates actual installed capability and enforces the selected mode in code. UI does not supply `toolsEnabled` or a permission decision. Configuration updates through settings apply to the next run.

```json
{
  "protocolVersion": 1,
  "requestId": "req-12",
  "type": "SubmitPrompt",
  "prompt": "Review my current changes.",
  "modelId": "qwen3:4b",
  "mode": "Plan",
  "skillId": "review-pull-request",
  "attachmentIds": []
}
```

## Host events and projection

Common host responses are Snapshot, Event, Accepted, Rejected and Notice. Snapshot includes bounded visible messages, installed models/capabilities, provider status, active state/run, skill metadata, attachment labels, usage and pending approval. Thinking is absent from snapshot and durable conversation.

Events carry the Core lifecycle (response/thinking, tools, policy, hooks, guardrails, MCP, context, cancellation and errors). Projection replaces ToolRequested arguments with a redacted argument summary, and ToolAwaitingApproval with `ApprovalView`. Before/after content stays in host-owned VS Code virtual documents or an explicit desktop DiffPreview response; it is absent from routine snapshots and Output logs.

```json
{
  "protocolVersion": 1,
  "hostSessionId": "host-1",
  "sequence": 42,
  "workspaceId": "workspace-1",
  "type": "Event",
  "runId": "run-7",
  "event": {
    "type": "ResponseDelta",
    "messageId": "message-9",
    "text": "I inspected the current changes."
  }
}
```

## Validation and race handling

Accept only known versions/types/fields with bounded strings, valid enum values and referenced IDs present in the current host session. Inbound message cap: 64 KiB, prompt cap: 16,000 characters, at most 10 attachment IDs. Reject duplicate request IDs, stale/cross-run approval IDs, mismatched preparation keys and concurrent prompts. Unknown version returns ProtocolVersionMismatch and no execution.

Sequence is global to the host session, including acknowledgments/snapshots. The UI applies only greater sequences in the same session; duplicate messages are ignored. A gap triggers Ready/resnapshot. Snapshot's sequence establishes the new baseline. A changed hostSessionId resets prior UI sequence/run state. Late ResponseDelta/approval events for a finished/cancelled run never append to a new run. Workspace-null session events may update runtime status; workspace events must match the active root.

Ready while approval is pending returns the same immutable ApprovalView, with no new authority. Cancellation/NewConversation invalidates that approval. ResolveApproval is only forwarded to ApprovalPort after validation; execution resumes through final guardrails and version/path revalidation, never directly from the router.

## Rendering and CSP

Render model/files/command output as escaped text or sanitized Markdown with raw HTML disabled. Code fences are text. Do not use arbitrary `innerHTML`, scripts or dynamic code execution. Use a nonce-based CSP, only extension-owned local resource roots, and no direct model endpoint in the Webview. Validate link schemes and deliberate navigation. Tool output UI retention is bounded; full source contents must not be duplicated in each activity row.

Output channel logging is a separate redacted projection of lifecycle metadata, durations and error codes. Never stringify the entire AgentEvent, call arguments, previews, process output, hook reason text or snapshots into the log. Environment values and secret file contents are excluded. MCP/hook executable/argv remain visible by product choice; users must keep secrets out of configured command arguments because the exact startup command is displayed. Configuration does not have an inline secret/environment-value field in v1.

## Desktop intents and resources

Desktop adds `OpenWorkspace` (native picker), `SelectWorkspace` (known recent path), `SelectConversation`, `RenameConversation`, `ArchiveConversation`, `ListWorkspaceFiles`, `SearchWorkspaceFiles`, `OpenWorkspaceFile`, `WorkspaceDiff`, `TestProvider`, `SaveProvider` and `SetTheme`. `OpenExternal` accepts only HTTP(S); `CopyText` accepts bounded text. `OpenProviderSetup` and `CompleteSetup` support guided onboarding in both hosts.

Desktop resource responses are `WorkspaceFiles`, `WorkspaceSearchResults`, `FilePreview`, `DiffPreview`, `ProviderModels` and `OpenPreferences`. File resources include the workspace ID; the renderer discards results from another root. Search results echo the query and expose truncation. Provider model checks echo the request ID so stale drafts cannot replace current results. Settings snapshots include provider metadata and `hasApiKey`, never a key. Only an explicit key-replacement draft sends a key into main, where it enters OS-backed storage or memory-only fallback.

Electron accepts IPC only from its own trusted main frame. Packaged rendering uses a static self-only script/style CSP and `connect-src 'none'`; HTTP/filesystem/commands stay in main. Development permits reloads only within the configured loopback origin. The shared DTO protocol stays data-only, and host validation does not delegate authority to renderer-supplied fields.

Version 0.5 adds `SetLanguage`, `SetTextSize`, `OpenDataDirectory`, `WindowAction` and the terminal intents `OpenTerminal`, `TerminalInput`, `ResizeTerminal`, `TerminalAck`, `CloseTerminal`. Main chooses the project and shell; UI cannot supply a terminal executable, environment or starting path. Terminal input is capped at 16,384 characters, dimensions at 500 columns/200 rows and acknowledgments at 65,536 characters. `TerminalOpened`, `TerminalData`, `TerminalClosed`, `WindowState` and `ToggleTerminal` are explicit host messages. Terminal traffic shares sequence ordering without entering chat history, activity or model context.
