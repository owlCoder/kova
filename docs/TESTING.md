# Testing strategy

## Automated checks

`npm run check` runs strict project/Core-isolation typecheck, ESLint, Prettier and Vitest. Tests verify runtime behavior alongside workspace dependency direction, static/re-export/type/dynamic import boundaries, protocol data-only constraints, one public behavioral type per file, representative violating-source detection and compile-time protocol invariants.

Core compiles with `types: []` and `lib: ["ES2022"]`, so Node/DOM ambient APIs cannot become accidental ports. Runtime source AST scanning checks all package source files; Core also has an ESLint restricted-import rule. Package manifests are checked separately, including dev/peer/optional dependencies. Tests inspect authored source, not installed dependencies. Computed module loads are rejected because their graph cannot be proven statically.

The deterministic suite uses fake providers, temporary files, native-adapter doubles and real fixture processes. Native Ollama/VS Code/ERS checks are explicit smoke commands; they are kept outside deterministic CI. Current observed results are recorded in IMPLEMENTATION.md.

## Behavior acceptance matrix

| Component              | Required cases                                                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ContextBuilder         | Count definitions/framing; Plan cost reduction; specified eviction order; pinned user/skill/system; current-step paired results; overflow; multiple result budgets; bounded persisted history |
| TokenCounter           | Empty/ASCII/multibyte text; conservative framing; stable rounding; provider-estimate correction cannot reduce safety reserves                                                                 |
| ConversationCompactor  | Complete-turn grouping; bounded structured summary; keep current turn/call pairs; prior-summary merge; no false successful-change claims                                                      |
| PermissionPolicy       | Every mode/risk cell; protected-write escalation; nonallowlisted Auto process; unknown MCP default; stronger Block retained                                                                   |
| ToolRegistry           | Duplicate rejection; registration/removal; Plan definitions; disconnected tools; captured per-run view                                                                                        |
| AgentLoop              | Prose completion; streamed deltas; multiple serial calls; exact iteration cap; terminal outcomes; cancellation during stream/approval/process; captured settings; unknown tools               |
| Malformed repair       | Invalid JSON/schema/name not executed; initial error + two repairs; IDs/names cannot reset allowance; repaired valid continuation; max-iteration accounting                                   |
| Repeated calls         | Sorted-argument fingerprint; second returns no execution; third stops; denied/blocked repeat; different arguments; per-user-turn reset                                                        |
| SkillLoader            | Required safe frontmatter; matching ID; duplicate IDs; cap; selected body only; path containment; clear selection                                                                             |
| HookPipeline           | Ordered reports; observe/veto; timeout/pre-error fail closed; post-error cannot change result; immutable input; no argument mutation/approval                                                 |
| GuardrailEvaluator     | Strictest merge retaining reasons; run after hooks in every mode; already-blocked call still evaluated; exception fails closed; approval cannot bypass Block                                  |
| ProtectedPathGuardrail | Exact config paths; `.git`/`.vscode` descendants; case/aliases; both requested and resolved path; every mode; read vs write                                                                   |
| CommandRiskClassifier  | All destructive examples and flag reorderings; exact parsed argv; extra args; quotes; separators/redirection/substitution/newlines; unknown/ambiguous parse                                   |
| WorkspacePathGuard     | Traversal; sibling-prefix attack; absolute inside/outside; symlink outside; link into protected tree; missing descendant; Windows drive/UNC; macOS case variants; symlink race recheck        |
| File tools             | One-based ranges; bounded output; edit zero/one/multiple/overlapping matches; no mutation on error; current editor content; stale version; preview recomputation; oversized/binary files      |
| ToolOutputLimiter      | Exact caps include omission marker; omission count; zero/short budget; narrowing hint; separate model/UI cap                                                                                  |
| Ollama mapping         | Explicit num_ctx/num_predict/think/keep_alive; native tool schemas and history; fragmented UTF-8 NDJSON; final usage; malformed call data; length; abort/timeout/runtime/model errors         |
| MCP adapter            | Handshake; paginated discovery; names/collisions; default/local override risk; Tool adaptation; bounded results; disconnect/unregister; no replay on timeout; process cleanup                 |
| ProcessRunner          | Bounded stdout/stderr under sustained output; exit code; timeout; cancellation terminates descendants; safe simple argv and explicitly approved shell expression                              |

## Required integration scenarios

1. Tool request → policy block → all pre-hooks → final guardrails → ToolBlocked → no executor invocation.
2. Tool request → permission allow/approval → pre-hook veto → final guardrails → no executor invocation.
3. Tool request → execution → post-hooks → paired result → model continuation/final answer.
4. Protected write in Auto → calculated diff → RequireApproval → reject means no write; approve applies exactly previewed current-version text.
5. File changes during approval → StaleContent → new preview/new approval; old key cannot write.
6. Malformed tool call → bounded repair diagnostic → valid continuation, or third error stops; repairs consume the shared limit.
7. Consecutive identical calls → execute once → no repeated side effect → third request stops.
8. Compound command in Auto → no allowlist match → approval required, unless destructive then Block.
9. MCP process discovery → standard Tool registration → normal policy/hooks/guardrails → call → bounded paired result.
10. Stop during stream/approval/command → cancellation outcome → no later write/late UI contamination; descendants are terminated.
11. Webview reload during approval → authoritative snapshot → same pending approval → invalid/stale/cross-run messages rejected.
12. Large tool/schema set → context overflow or defined eviction → no silently truncated request; real UI total equals sent num_ctx.

Fixtures use fake `LlmProvider`, in-memory workspace/approval ports, controlled clocks and a local stdio MCP server. No network/Ollama/model is required for deterministic CI. Deterministic CI never runs live projects or destructive commands. The opt-in ERS smoke invokes only its fixed reviewed MCP tools, public dummy fixtures and blocked safety requests. OS-sensitive path/process checks run on Linux, macOS and Windows before claiming release support on each platform.

## Architectural tests throughout delivery

Every milestone reruns the initial checks. Expand the import graph to each new source extension/build entry and any package addition. Explicitly test Core rejecting vscode, React, MCP SDK, Ollama modules, filesystem/process/HTTP imports, Node globals and AbortSignal. Extend the scanner/type checker if aliasing or inherited behavioral interfaces is introduced; do not treat the initial AST patterns as a complete security proof.

Verify interface/implementation separation for each new class, module direction, protocol DTO-only types, and that adapters alone own HTTP/Node/VS Code/MCP/React APIs. A failure requires fixing the implementation or a reviewed ADR, not weakening the rule to make CI green.

## Manual/local checks

Foundation: launch the VS Code extension development host, run Kova: Open Chat to open the sidebar, discover qwen3:4b, stream a response, stop generation, see context/definition cost and thinking collapse when enabled. Test unavailable runtime and missing model without crashing. Run Kova: Open Chat in Editor and verify shared conversation state, single-tab reuse, moving between editor groups, close/reopen state and cancellation, sidebar hiding without cancellation, captured file attachments and isolated VSIX installation.

Editing: approve/reject a computed diff, observe editor undo and Git, verify stale document handling. Hooks/MCP: visible exact commands, lifecycle events and clean disposal. Auto: destructive guardrail demonstration and exact allowlisted command behavior. Measure bounded memory using long fixture conversations/output instead of claiming it from class names.

ERS: requires the real example project and its MCP/guardrail API. Record exact commands/model, observed tool names, review output and blocked destructive request. Reverify name availability/trademark before public Marketplace publishing; no publishing is part of these checks.

## Desktop checks

`tests/runtime/desktop.test.ts` covers atomic/stale file writes, symlink containment, bounded filename search, cancellation, lazy indexed history, settings validation, renaming/archiving, interrupted response restoration, strict IPC validation and an actual shared-agent approval/edit/continuation loop. `desktop-keys.test.ts` verifies encrypted endpoint-scoped storage, deletion and memory-only fallback with a mocked OS encryption service.

Run `npm run desktop:build` and `npm run desktop:verify` to check packaged CSP, preload/main isolation, assets and dependency notices. Run `npm run desktop:smoke` for an isolated native UI fixture using a synthetic local Ollama server. Send a prompt; test Markdown/code copy, provider discovery/save, file search/preview/context, proposed diff and Allow once, Stop, session switching and appearance. Quit to verify the actual file and persisted session. No external AI service is required.

The Desktop builds workflow runs checks and creates installers on macOS, Windows and Linux. A successful installer build is not evidence of native UI behavior; each OS still needs the manual workflow before claiming native interaction verification. Cloud-provider tests use fixture responses; live cloud credentials are not available in deterministic CI. Unsigned artifacts are for development/review until release signing is configured.

Terminal regression tests start a real PTY on the native runner, wait for PowerShell’s initial prompt before sending commands on Windows, verify project cwd and TTY status, resize, reattach, Ctrl+C and shell cleanup on project changes. Localization tests check matching Serbian/German catalogs, interpolation, English fallback, preference migration and invalid terminal/window/language requests. Native interface smoke checks cover all three languages, large typography, About content and actual terminal execution; repeat against the packaged app to verify native binaries outside ASAR.

## Conversation tools and draft recovery

Search tests cover literal regex characters, Unicode/emoji offsets and bounded result sets. Native UI checks verify matches in prose and code, forward/backward keyboard navigation, Escape focus return and both themes. Export checks verify native Markdown save/clipboard behavior and exclude tool/system/repair entries; active or stale-session exports are rejected.

Draft tests cover persistence across new store/extension instances, isolation, bounds, clearing the consumed prompt and preserving a newer draft during submission. Native VSIX smoke checks include workspace draft storage and Markdown export. Set `KOVA_SMOKE_PROVIDER_URL` to a synthetic local Ollama endpoint to run the native extension checks without downloading a real model; omit it for the default local Ollama installation.

## Personal prompt resources

`prompt-library.test.ts` checks exact persisted text and restart, edit identity, bounded capacity, stale concurrent edits, failed writes, corruption preservation and strict validation in both hosts. Chat-session tests verify that connected views receive authoritative updates, new conversations retain saved prompts, and saved library text stays out of routine snapshots and model requests. Installed-VSIX smoke checks exercise create/edit/remove and clipboard acknowledgments.

Native review: save a draft and a message, adapt a template, search saved text, edit, remove/undo, insert into an existing draft without sending, close/reopen and restart the app. Check keyboard focus in browse/edit modes, Escape restoration, all three languages, both themes and the largest text setting in a narrow VS Code sidebar. Confirm that the lazy library module and stylesheet load under the installed extension's CSP. Copy code and verify success feedback after the native clipboard write.

For the concurrent-view regression, open the library in both the VS Code sidebar and editor tab. Edit the same saved prompt in each, then save one view. The other must retain its draft, disable stale save/removal and offer Save a copy. Saving that copy must leave the committed prompt and its original ID unchanged while adding the retained draft as a new item.
