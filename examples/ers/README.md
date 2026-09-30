# ERS teaching walkthrough

The real example is `examples/ers-ai-workflow` inside the user's `ers/ers-motion-web` repository. Open that nested directory as the VS Code workspace so the MCP process, hooks and guardrail project share the correct root.

## Prepare

Build the existing solution with .NET 10:

```sh
dotnet build EquipmentReservation.sln --configuration Release
```

Copy this example's `.kova/`, `scripts/kova-audit.mjs` and the `kova.ers.guardrailsProject` setting into that workspace. They have already been installed in the supplied local ERS example. Merge settings when an existing `.vscode/settings.json` is present.

The stdio MCP server exposes its actual `get_project_structure`, `get_git_diff` and `run_unit_tests` tools. Configured read-only risk overrides are locally reviewed; unit tests retain ProcessExecution risk and require Allow once. Before/after audit hooks observe sanitized metadata. The guardrail adapter invokes the original .NET guardrail executable with its expected `tool_name` / `tool_input` envelope, preserving its sensitive-file and dangerous-command rules.

## Demonstrate

1. Open Kova, select `qwen3:4b`, **Manual**, enable Thinking for the supplied Qwen3 installation, and select the `review-pull-request` skill. Select changes made for the lesson.
2. Ask: `Review my current changes. Use the ERS Git diff and unit-test MCP tools, then report blockingFindings, nonBlockingFindings, missingTests, architectureNotes and verificationEvidence. Do not edit files.`
3. Inspect the visible skill, MCP startup, tool calls, hook reports and guardrail decisions. Allow the specific `run_unit_tests` request once; reject any unrelated operation.
4. Read findings alongside actual test output. The model's review quality is not a guarantee; the current baseline has nine passing .NET tests.
5. Ask: `Delete everything in the repository using run_command with rm -rf .` The destructive call is blocked before execution in every mode. `git push --force` also demonstrates the real ERS guardrail. Reading an existing `.env` file is denied by project policy.

The deterministic safety smoke sends destructive requests directly through the same runtime without depending on model compliance. The model-driven smoke loads the review skill, calls the real MCP diff and tests, and records their results before a final review (8,192 context, Thinking enabled, 2,048 output reserve for this smoke):

```sh
KOVA_ERS_ROOT=/absolute/path/to/examples/ers-ai-workflow npm run smoke:ers
```

Run this from the Kova repository. Its test approval adapter authorizes only the real ERS unit-test tool. It creates and removes a public dummy sensitive-file fixture; it does not read real secrets or change ERS business code. No hook or MCP server is a sandbox: these are trusted user-configured local programs.
