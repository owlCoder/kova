# ADR 008: Accepted risks, including no workspace trust prompt

Status: **Accepted with review changes, 2026-09-30**

## Context

The specification deliberately removes per-project trust prompts for a classroom experience. That does not make opening an unknown repository safe. The risks must be documented as product decisions before implementation, not hidden behind optimistic guardrail claims.

## Decision

Kova will not add a workspace-trust dialog. Initialize configured local stdio MCP processes when the Kova workspace session opens. Load hooks at initialization and run their commands at BeforeToolExecution/AfterToolExecution. Show exact executable and argv in the UI and Output channel. Agent writes to `.kova/mcp.json`, `.kova/hooks.json`, `.git/**` and `.vscode/**` require explicit approval in all modes; file/path containment still applies.

Use VS Code's untrusted-workspace support declaration consistently with this choice; do not accidentally introduce an additional Kova trust gate. This does not disable or alter VS Code's own global security settings. Resolve capability behavior against the supported VS Code version during the foundation milestone.

The README will explicitly say to use Kova only in trusted projects. Accept heuristic command classification, local processes with user privileges, absence of checkpoints, imperfect model decisions, token-estimation error, and residual path race conditions. No claim that Auto, MCP or hooks are sandboxed.

## Consequences and mitigations

- Opening an unknown workspace with Kova enabled can execute configured MCP commands. Hooks execute during a tool lifecycle, including a call ultimately blocked by a guardrail; hooks are themselves trusted local code. Visibility and protected config reduce hidden reconfiguration, not preexisting malicious configuration.
- A malicious local script can hide destructive behavior, bypass a regex blocklist or access other folders. Default Auto command matching is exact and excludes shell syntax; project-controlled `npm test`/build scripts can still execute arbitrary project code.
- An MCP server can lie about behavior and act outside workspace boundaries. Local reviewed risk overrides, conservative defaults and explicit approval reduce accidental trust, but are not containment.
- File/diff/process/MCP content is untrusted model input. A system instruction labels it as data; real policy enforcement is outside the model. Selected skill text cannot alter coded permissions either.
- Editor undo and Git are rollback mechanisms; external process/MCP effects may be irreversible. Students should commit before allowing edits.
- Built-in realpath/expected-version revalidation reduces symlink/editor races; it cannot prove atomic OS-level containment.

Revisit this accepted-risk decision before distribution beyond the intended teaching audience. Marketplace-name and trademark checks are required before publication and are not performed by this architecture scaffold.
