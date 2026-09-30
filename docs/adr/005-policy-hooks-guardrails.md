# ADR 005: Four modes and monotonic safety decisions

Status: **Proposed**

## Context

Permission modes, lifecycle hooks and guardrails have different jobs. Auto must not permit a hook, tool or model to bypass a protected-path or destructive-command decision.

## Decision

Modes are exactly Plan, Manual (default), Edit and Auto. Dynamic invocation risk is independent of presentation. Baseline policy → all pre-hooks → strictest guardrail evaluation → approval if required → revalidation → execution → post-hooks. Hooks observe or veto, never approve, mutate arguments or supply guardrail configuration. Guardrails run after pre-hooks in all modes, even when the prior decision blocks the call. Only `max(Allow, RequireApproval, Block)` may combine decisions.

Plan exposes read-only tools only and also blocks unexpected write calls in code. Manual approves state changes. Edit automatically permits ordinary in-workspace writes. Auto permits nonprotected writes and exact parsed allowlisted commands. Shell chaining, redirection, substitution, ambiguous parsing and any extra argv prevent allowlist matching. Unknown MCP state-changing tools require approval in Auto. Destructive invocations are always blocked. Protected writes always require approval unless an existing stronger block applies.

Pre-hook failure/timeout is a veto; post-hook failure is reported after the fact and cannot retroactively undo an executed operation. Guardrail failure is fail-closed. After approval, recheck safety and preparation immediately before execution. Approval satisfies one RequireApproval decision; it never turns Block into Allow.

## Consequences

This is a policy layer, not an OS sandbox. Exact matching is restrictive but teachable. See [policy matrix](../TOOLS-AND-POLICY.md). Auto ships only in the guardrail milestone after the required integration tests pass.
