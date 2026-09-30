# Implementation and acceptance evidence

Implemented on 2026-09-30 after architecture approval and the user's authorization to complete all milestones without intermediate stops. The original pasted specification remains unchanged. The approved changes were applied to docs/ADRs in commit `1de4254` before runtime implementation.

## Delivered

All seven milestones are represented in the extension: local chat/context/thinking, seven workspace tools, file previews and approvals, selected skills, stdio MCP, hooks/guardrails/Auto, and the actual ERS integration. The host owns authority; Core is framework-free, Protocol is independent, and React receives bounded presentation DTOs.

| Milestone | Verified acceptance criteria and method                                                                                                                                                                                                                                                           | Deviations / remaining risk                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Real `qwen3:4b` discovery and streamed answer; real generation cancellation; separate thinking and measured usage; exact num_ctx=8192/think/keep_alive payload assertions; native VS Code sidebar activation and context events; Core/protocol architecture checks                                | Token estimation is heuristic. Local Qwen3 with think:false can emit reasoning as content and exhaust output; the model-driven tool demo enables Thinking.                               |
| 2         | Four read tools tested on temporary workspaces; native-call/result continuation, schema/unknown rejection, two repairs, repeat suppression/third stop and hard limit of 10 attempts tested with fake providers; real ERS MCP diff call                                                            | Text that resembles a tool call is never executed. Model selection and review quality remain probabilistic.                                                                              |
| 3         | Containment, absolute paths, traversal, external/protected/dangling symlinks, exact match counts and stale versions tested; native WorkspaceEdit create/replace, editor Undo and denied approval verified in actual VS Code                                                                       | Stale writes return StaleContent and require another tool request/preview. Editor edits can remain dirty; Save is controlled by VS Code/user. Residual OS races remain an accepted risk. |
| 4         | Required frontmatter/name/description, unsafe/duplicate/oversized metadata and explicit load/clear tested; only the selected skill body enters context; real ERS review emits SkillLoaded                                                                                                         | Minimal plain frontmatter parser; arbitrary YAML and compatibility directories are intentionally unsupported.                                                                            |
| 5         | Real stdio legacy fixture handshake/discovery/calls/disconnect; schema/name/page/result bounds, risk defaults, unsupported content and cancellation tests; actual .NET ERS MCP server discovery and normal runtime execution                                                                      | MCP programs are trusted local processes. No remote transports, auth/browser flows or automatic replay.                                                                                  |
| 6         | Complete mode/risk matrix, compound-command allowlist exclusion, fail-closed pre-hooks, immutable observational input, post-hook failure/cancellation preserving results, final guardrail recheck, approval escalation in Auto, timeout/process-tree cleanup and idle configuration reload tested | Command classification is heuristic; allowed project scripts can have arbitrary effects. Hooks run directly via ProcessRunner as trusted configuration.                                  |
| 7         | Actual ERS structure/diff and approval-gated unit-test calls; nine .NET tests pass; pre/post hooks observe; rm -rf ., force push and sensitive-file requests are blocked before execution; real Qwen3 selected-skill review consumes MCP results                                                  | Baseline tracked diff was empty, so the observed review reports no code changes. This verifies the integration, not its ability to identify arbitrary bugs.                              |

## Observed local checks

- `npm run check`: strict project/Core typecheck, ESLint, Prettier and the full deterministic suite (153 tests in 13 files, including 30 architecture tests) pass. Architecture checks remain mandatory.
- `npm run package` and `npm run verify:package`: installable 0.1.0 VSIX, original logos, publisher owlcoder, MIT, bundled code and 16 dependency license notices; no source maps, node_modules, tests, project configs or secrets in the package.
- `npm run smoke:ollama`: installed model, streaming, explicit parameters, actual usage, Stop and thinking/history separation pass.
- `npm run smoke:vscode` / `npm run smoke:vsix`: actual VS Code activation and native editor behavior pass; the VSIX was installed in a separate profile and tested from its installed directory.
- `dotnet build EquipmentReservation.sln --configuration Release` and `dotnet test ... --no-build`: build succeeds with zero warnings/errors; 9 tests pass.
- `npm run smoke:ers`: actual ERS tools, hooks, guardrail executable and local-model review pass. This opt-in test uses 8192 context, 2048 output reserve and Thinking enabled.
- Webview preview: supplied logo renders, sidebar layout/text fit, browser console has no warnings/errors. Native host behavior is verified separately above.

Real ERS review evidence:

```json
{
  "toolCalls": ["mcp__ers__get_git_diff", "mcp__ers__run_unit_tests"],
  "blockingFindings": [],
  "nonBlockingFindings": [],
  "missingTests": [],
  "verificationEvidence": "Git diff: empty. Unit tests: 9 passed, 0 failed."
}
```

The actual example is `/Users/danijel/Desktop/ers/ers-motion-web/examples/ers-ai-workflow`. Only Kova configuration, the canonical review skill, audit hook and optional guardrail setting were added; ERS business source is untouched. Reusable templates are under `examples/ers`.

## Release limits

Native integration is verified on macOS with local Ollama 0.35.0, qwen3:4b, Node 24.19/npm 11.17 and .NET 10. Windows/Linux require native release smoke checks. The active root is selected at extension activation; multi-root switching is not dynamic. History is session-local, compaction is lossy, and cancellation does not roll back completed file/process/MCP effects.

No non-goal was added, including an extra workspace-trust prompt. MCP and hook configurations execute with user privileges and are not sandboxed. The accepted risks are in ADR 008.

Marketplace preparation is in MARKETPLACE.md. The package has not been published. Publisher account authorization/availability must be verified before upload; GitHub source remains private until its owner changes visibility.
