# ADR 009: Architectural fitness and incremental delivery

Status: **Proposed**

## Context

Clean Architecture is a concrete requirement, and it should survive future feature work. The project must not confuse successful contract checks with a tested application.

## Decision

Run strict typecheck, lint, format and architecture/contract tests in CI from the first commit. Use compiler ASTs rather than text-only import matching, enforce package dependency direction and one public behavioral type per file, and compile Core without Node/DOM globals. Test the test harness with representative violating source so a green check has a concrete meaning.

After architecture approval, implement the specified milestones sequentially. Each milestone adds isolated behavior tests and its integration scenarios, then runs the full check suite. Fake providers, in-memory ports and local stdio fixtures make CI independent of Ollama and network access. Real Ollama/VS Code smoke checks complement CI in the foundation and tools milestones. The ERS milestone requires access to the real Equipment Reservation project; do not invent a successful integration.

## Consequences

The initial tests prove contract shape, import boundaries and organization only. No fake tests for unimplemented behavior or placeholder application are presented as MVP completion. [TESTING.md](../TESTING.md) and [MILESTONES.md](../MILESTONES.md) define the future acceptance gates.
