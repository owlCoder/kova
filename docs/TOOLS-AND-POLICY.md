# Tools, risk, permission and guardrails

Status: **Proposed**. This is the exact behavior contract for the tools milestone onward.

## Tool lifecycle and inputs

`ToolDefinition` declares name, description, object JSON input schema, baseline risk and observational origin. Registry rejects duplicate names. Each tool has read-only `prepare`, then `execute` only after the coded safety pipeline. ToolInputValidator validates native provider data before preparation; no coercion of missing fields or silent stripping of dangerous unknown fields.

| Tool           | Input fields (all schemas reject unknown properties)                 | Risk and behavior                                                                                                        |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| read_file      | `path: string`; optional `start_line`, `end_line`: positive integers | ReadOnly; one-based inclusive range, paired/ordered bounds; bounded UTF-8 text                                           |
| list_directory | `path: string`                                                       | ReadOnly; direct children only, no recursive dump                                                                        |
| search_files   | `query: string`; optional `glob: string`, `max_results: integer`     | ReadOnly; literal text query, default 20 and hard max 100 matches; skip `.git`, dependencies, binaries and ignored files |
| get_git_diff   | optional `staged: boolean`, `path: string`                           | ReadOnly; default unstaged, optional root-contained path; fixed Git argv or Git extension API                            |
| write_file     | `path: string`, `content: string`                                    | WorkspaceWrite; create or full replacement with current before/after preview                                             |
| edit_file      | `path: string`, `old_string: nonempty string`, `new_string: string`  | WorkspaceWrite; exactly one literal match required                                                                       |
| run_command    | `command: nonempty string`                                           | Dynamic ProcessExecution/Destructive; fixed active-root cwd, bounded cancellable execution                               |

Paths may be root-relative or inside-root absolute paths on the current platform. No arbitrary cwd input, file deletion tool, unified patches, regex replacement or catch-all tool. For search, validate every match's actual resolved path before reading it; globs cannot escape the workspace. Skills/config reads and attached files also use WorkspacePathGuard.

`edit_file` computes a literal occurrence count without changing the file. Zero or multiple matches returns `EditMatchCount` with `{ "matchCount": N }`, no mutation. Even overlapping candidate occurrences count as ambiguity. `write_file`/`edit_file` refuse binary/oversized files and encode text consistently with the editor. The adapter preserves expected document versions; `WorkspaceEdit` and Git provide undo. `ToolResult` always pairs callId/toolName, status, bounded output, structured error/details, omitted characters and duration.

## Decision order and matrix

```text
validated call → read-only preparation → dynamic risk → permission policy
→ all pre-hooks → all guardrails → approval if required
→ immediate path/version/guardrail revalidation → execution → post-hooks → result
```

| Invocation                                          | Plan  | Manual          | Edit            | Auto            |
| --------------------------------------------------- | ----- | --------------- | --------------- | --------------- |
| Read-only built-in / locally reviewed read-only MCP | Allow | Allow           | Allow           | Allow           |
| Ordinary contained workspace write                  | Block | RequireApproval | Allow           | Allow           |
| Protected-path write                                | Block | RequireApproval | RequireApproval | RequireApproval |
| Exact allowlisted run_command                       | Block | RequireApproval | RequireApproval | Allow           |
| Other non-destructive command                       | Block | RequireApproval | RequireApproval | RequireApproval |
| MCP tool with default/unknown process risk          | Block | RequireApproval | RequireApproval | RequireApproval |
| Destructive invocation                              | Block | Block           | Block           | Block           |
| Outside-workspace built-in path                     | Block | Block           | Block           | Block           |

Every cell is a baseline subject to stricter hooks/guardrails. ReadOnly is not an unconditional grant. Guardrails cannot weaken policy. All guardrail reasons remain visible; a blocked call does not trigger a pointless approval dialog. Approvals are one invocation only and cannot override Block.

## Workspace containment and protected paths

WorkspacePathGuard is an adapter port because realpath/case behavior is platform-dependent. Required algorithm: resolve root and candidate, normalize segments, follow symlinks, compare path-segment containment rather than string prefixes. `/project-other` is not inside `/project`. For a new file, resolve the nearest existing ancestor and append checked nonexisting segments. Reject outside-root drive letters, UNC paths, platform-incompatible path syntax and outside symlinks. Use case-insensitive comparisons on Windows/macOS per specification, while avoiding ambiguous alias access. Test case-sensitive macOS volumes explicitly; when realpath/case identity is ambiguous, reject rather than broaden access.

Resolve dirty editor text through VS Code but recheck the underlying path and expected editor version before write. Protect both the requested path alias and actual target: an ordinary-looking symlink into `.vscode` or `.git` still requires approval. Exact case-normalized protections are `.kova/mcp.json`, `.kova/hooks.json`, `.git` and all descendants, `.vscode` and all descendants. `.kova/skills/**` is contextual and not protected by this particular guardrail, but still contained and mode-controlled.

ProtectedPathGuardrail returns RequireApproval for writes only, in every mode; an existing Block remains stricter. Preparation must not mutate executable configuration or create missing directories. At execution the writer creates only checked parent directories as part of an authorized workspace edit. A symlink swap after final validation remains an acknowledged OS race limitation.

## Commands

Default `kova.commands.allow`: `git status`, `git diff`, `git log`, `dotnet build`, `dotnet test`, `npm test`. Parse both configured entries and requested commands into exact executable + argv tuples. Match the entire tuple, not prefixes. `npm test -- --updateSnapshot`, `git diff --output=foo` and `dotnet test extra.csproj` do not inherit approval from the defaults. Custom entries must be exact, parseable, non-destructive simple commands.

Chaining/redirection/substitution (`&&`, `||`, `;`, `|`, `>`, `<`, `$()`, backticks), newlines, shell expansions, ambiguous tokenization and environment assignments do not match Auto's allowlist. Use argv execution without a shell for matching simple commands. A nonallowlisted shell expression needs explicit approval and still passes guardrails. The host does not pass model input straight into exec before the pipeline.

Destructive patterns include recursive/force deletion (`rm -rf` and reordered/split flag forms), `find ... -delete`, `git clean -fd`/equivalent flag combinations, `git reset --hard`, PowerShell `Remove-Item -Recurse`, and `del /s`. Normalize case/whitespace/tokens for classifier tests; conservative ambiguity can require approval. These heuristics do not identify every destructive script. Commands, build tools, MCP and hooks run with user privileges and are not sandboxed.

Commands have bounded stdout/stderr, default 60-second timeout (configurable through host settings in the process milestone), termination of process descendants and cancellation. Tool timeout returns a structured error the model can see, not a hanging approval/run.

## Hooks and guardrails

Only BeforeToolExecution/AfterToolExecution are supported. Hooks receive immutable sanitized context via JSON stdin and return observation/veto through the defined exit-code contract. They cannot replace arguments, approve an operation or configure guardrails. Pre-hook timeout/failure/veto maps to Block; post-hook errors are reported after execution and do not change the result. Pipeline runs configured hooks in order, recording all reports and vetoes.

Guardrails are coded objects registered in composition, not entries in hooks.json. Each returns Allow, RequireApproval or Block; the evaluator takes the strictest action including the baseline/pre-hook veto, retaining reasons. Evaluate after all pre-hooks even when already blocked, and recheck immediately before execution after an approval wait. Unexpected guardrail exceptions become Block. At least containment, protected-path and destructive-command guards are required before Auto is enabled.
