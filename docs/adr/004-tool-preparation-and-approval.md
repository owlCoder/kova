# ADR 004: Prepared tools and approval binding

Status: **Proposed**

## Context

Small models generate unreliable patch formats. Approval must show what Kova will actually change. A user can edit the file while a request awaits approval, and symlinks can change between validation and execution.

## Decision

Each `Tool` defines `prepare` and `execute`. Preparation is read-only: validate/normalize paths, classify command structure and compute a before/after preview from actual editor content. An immutable `PreparedToolCall` binds invocation, paths, expected versions, preview and a preparation key. Core computes risk and policy from this prepared call.

`edit_file` requires exactly one literal occurrence, including whitespace; it does not apply unified diffs. `write_file` creates or fully replaces a bounded text file. Both use VS Code `WorkspaceEdit` for editor undo. Approval is AllowOnce or Reject, tied to run/call/preparation key. The adapter compares document versions and re-resolves paths immediately before applying. Stale preparation returns `StalePreparation`; the call must be prepared and approved again where policy requires it.

Full diff contents stay in host-owned virtual documents. The UI receives paths and a diff-open intent. No checkpoint system, persistent approval, or model-supplied diff is used.

## Consequences

`prepare` is an explicit extension to the specification's minimal tool interface. It gives every tool the same lifecycle without branching on its origin. Complete prevention of operating-system TOCTOU races is outside v1; stale editor/version and realpath checks reduce, but do not eliminate, that risk. Never execute directly from a model candidate or a UI approval message.
