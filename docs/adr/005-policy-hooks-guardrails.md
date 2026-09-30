# ADR 005: Four modes and monotonic safety decisions

Status: **Accepted with review changes, 2026-09-30**

## Context

Permission modes, lifecycle hooks and guardrails have different jobs. Auto must not permit a hook, tool or model to bypass a protected-path or destructive-command decision.

## Decision

Modes are exactly Plan, Manual (default), Edit and Auto. Dynamic invocation risk is independent of presentation. Baseline policy → all pre-hooks → strictest guardrail evaluation → approval if required → revalidation → execution → post-hooks. Hooks observe or veto, never approve, mutate arguments or supply guardrail configuration. Guardrails run after pre-hooks in all modes, even when the prior decision blocks the call. Only `max(Allow, RequireApproval, Block)` may combine decisions.

Plan exposes read-only tools only and also blocks unexpected write calls in code. Manual approves state changes. Edit automatically permits ordinary in-workspace writes. Auto permits nonprotected writes and exact parsed allowlisted commands. Shell chaining, redirection, substitution, ambiguous parsing and any extra argv prevent allowlist matching. Unknown MCP state-changing tools require approval in Auto. Destructive invocations are always blocked. Protected writes always require approval unless an existing stronger block applies.

Every hook has a timeout. A BeforeToolExecution crash, timeout or invalid output vetoes the call with a visible reason. An AfterToolExecution failure is logged and shown, without changing a decision already taken. `CommandHook` uses `ProcessRunner` outside run_command policy: it is user-configured executable code, like mcp.json. Guardrail failure is fail-closed. A guardrail's RequireApproval, **including in Auto**, always passes through ApprovalPort. After approval, recheck safety and preparation immediately before execution; approval never turns Block into Allow.

At each run's start, while idle, compare content hashes of `.kova/mcp.json` and `.kova/hooks.json` with the loaded versions. Restart only added/changed MCP servers, stop removed ones, and reload changed hooks. Emit a visible **configuration reloaded** activity row. Never reload during a run; changes made in that run become effective at the next idle run start.

## Consequences

This is a policy layer, not an OS sandbox. Exact matching is restrictive but teachable. See [policy matrix](../TOOLS-AND-POLICY.md). Auto ships only in the guardrail milestone after the required integration tests pass.
