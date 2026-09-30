# Accepted architecture review — 2026-09-30

Architecture is approved with these amendments; implement **one milestone at a time** and stop for review after each.

- At each idle run start, hash MCP/hook configuration. Reload only changes, restart only changed MCP servers, stop removed servers, and show **configuration reloaded**. Never reload mid-run. Implement this when MCP/hooks arrive, not in chat-only milestone 1.
- Every hook has a timeout. Pre-hook crash/timeout/invalid output vetoes visibly; post-hook failure is logged/shown but cannot change the completed decision. CommandHook uses ProcessRunner outside run_command policy as trusted user configuration.
- WorkspaceWriter receives expected content version/hash and returns structured StaleContent on mismatch, without overwriting.
- Protocol owns all DTOs, with **zero Core imports**. Host maps explicitly.
- Interfaces serve real IO/process/model/UI boundaries or actual test fakes; single-implementation policies, classifiers, evaluators, compactor and loader are concrete classes.
- ChatRequest explicitly carries context window (`num_ctx`), thinking (`think`) and keep-alive (`keep_alive`). Final Finished ChatEvent carries provider input/output usage (`prompt_eval_count`/`eval_count`) for TokenCounter reconciliation.
- `kova.commands.allow` is the Auto allowlist. `&&`, `||`, `;`, `|`, redirection, `$()` and backticks never match. A guardrail RequireApproval in Auto uses ApprovalPort.
- State machine retains IterationLimit, RepeatedToolCall and MalformedToolCall: max 10 attempts, two malformed repair opportunities, second identical call suppressed, third stops (spec §9).

No workspace-trust prompt or other non-goal is added. The later user instruction authorized all milestones without stopping; implementation and acceptance evidence are recorded in [IMPLEMENTATION.md](IMPLEMENTATION.md).
