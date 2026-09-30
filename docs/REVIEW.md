# Architecture review

Status: **Accepted with [amendments](REVIEW-CHANGES.md)**. This is a reviewable baseline fulfilling the original specification's architecture-only first step. The subsequent user instruction authorized all milestones without intermediate stops. See [implementation evidence](IMPLEMENTATION.md).

## Scope delivered

- Original specification retained unchanged in `SPECIFICATION.md`.
- ADRs 001–009 cover boundaries, provider/cancellation, context, tools/approval, policies/hooks/guardrails, skills/MCP, event-driven protocol, risks and tests.
- Final logical package/repository tree, dependency diagram and ownership/composition/lifetime rules.
- Typed provider/tool/skill/hook/MCP/permission/workspace/context/conversation/agent contracts, plus JSON host/Webview DTOs.
- Agent execution states, bounded repair/repeat/iteration behavior and cancellation races.
- Context eviction, token reconciliation, history/UI limits and deterministic compaction design.
- Required unit/integration/architectural acceptance matrices and milestones.
- Automated architecture checks and CI; runtime verification is recorded separately in IMPLEMENTATION.md.

## Decisions to confirm

1. Neutral Protocol package is the only extra runtime package; IO adapters remain under VS Code.
2. `Tool.prepare` is a read-only phase that makes normalized paths and computed previews available before policy/approval; exact file versions bind approval.
3. Deterministic compaction is used in v1, avoiding an extra local model call. Summary quality is explicitly limited.
4. MCP tools default to ProcessExecution; locally reviewed `toolRisks` may make known tools available in Plan. Remote annotations alone cannot grant read-only status.
5. Exact command argv matching in Auto excludes additional arguments and all shell syntax unless separately configured and approved.
6. No Kova workspace-trust prompt. MCP startup and hook execution are visible but can run trusted-project code with user privileges.
7. Thinking remains transient; pending approval and visible transcript are resynchronized from host snapshots after reload.
8. One active selected workspace and one run at a time keep multi-root/context/process state understandable.

## Requirement traceability

| Original requirement                          | Design/source                                                    |
| --------------------------------------------- | ---------------------------------------------------------------- |
| ADRs and final tree/dependency direction      | `adr/`, `ARCHITECTURE.md`                                        |
| Agent state machine/structured events         | `AGENT-LOOP.md`, Core agents contracts                           |
| Provider abstraction, streaming, cancellation | `PROVIDERS.md`, Core providers/common/models contracts           |
| Tool abstraction, edit semantics, previews    | `TOOLS-AND-POLICY.md`, Core tools/workspace contracts            |
| Skills                                        | `INTEGRATIONS.md`, Core skills contracts                         |
| Hooks and guardrails                          | ADR 005, `TOOLS-AND-POLICY.md`, Core hooks/permissions contracts |
| MCP abstraction/adaptation                    | ADR 006, `INTEGRATIONS.md`, Core mcp contracts                   |
| Mode/risk/protected paths/commands            | `TOOLS-AND-POLICY.md`, Core permissions/workspace contracts      |
| Context/compaction/persistence/limits         | `CONTEXT.md`, Core context/conversations contracts               |
| Host/Webview message protocol                 | `PROTOCOL.md`, Protocol source                                   |
| Unit/integration/architecture tests           | `TESTING.md`, `tests/`, CI                                       |
| Risks and accepted limitations                | ADR 008, this document, README                                   |
| Incremental implementation plan               | `MILESTONES.md`                                                  |

## Risks and unresolved external dependencies

| Risk/dependency                        | Practical implication                                          | Mitigation/next validation                                                                        |
| -------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| No workspace trust dialog              | Existing project MCP/hook configuration can execute local code | Explicit README/UI command visibility, protected agent writes; intended trusted teaching projects |
| Heuristic commands and project scripts | An allowed build/test script can be destructive                | Exact Auto matching, all-mode destructive guards, honest limitation                               |
| MCP side effects/annotations           | Remote process may lie or act outside root                     | Conservative risk defaults, operator-reviewed config, approval; no sandbox claim                  |
| Prompt injection                       | File/tool/MCP output may try to alter instructions             | Label as data; coded mode/guardrail/approval enforcement independent of model                     |
| Token estimation                       | Native tokenizer can use more tokens than estimate             | Explicit window/reserves, reported usage correction, overflow tests with qwen3:4b                 |
| Small model reliability                | Wrong tools, malformed calls and repetitions                   | Validation, two repairs, repeated-call suppression and hard attempt limit                         |
| Editor/path races                      | File/symlink changes while approval is pending                 | Immutable preview key, editor version check, path revalidation; residual OS race documented       |
| Deterministic summary loss             | Older details can be omitted or summarized poorly              | Structured bounded summary, explicit omission markers, user reattachment                          |
| Process cleanup portability            | Descendants may survive naive cancellation                     | OS-specific integration tests before Auto/process release                                         |
| Capability/runtime variation           | Ollama/model/SDK fields can change                             | Adapter-isolated DTOs, current primary docs, pinned wire fixtures per milestone                   |
| Actual ERS project unavailable         | Exact tools/guardrail API cannot be integrated yet             | Milestone 7 uses real project when supplied, no fabricated integration                            |
| Name/icon/license/distribution         | Marketplace/trademark identity is unverified                   | Review before publication; no Marketplace release in this phase                                   |

## Review gate

The source specification §41 says: **“Do not generate broad production implementation until this architecture is reviewed and approved.”** That instruction is the reason runtime implementation remains pending after this deliverable. The user approved the amended baseline on 2026-09-30 and authorized milestone 1, Foundation/chat. Stop for a report/confirmation at each milestone.

Automated checks establish compile-time consistency and package boundaries. They do not establish runtime security, model quality, OS containment, successful ERS integration or an installable extension. Those require the milestone acceptance evidence above.
