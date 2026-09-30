# Using Kova

Open the project folder in VS Code, then run **Kova: Open Chat**. Skills, tools, MCP and hooks use that workspace root. The editor tab and sidebar share the same conversation.

## Context and thinking

The defaults are 32,768 context tokens, 4,096 reserved output tokens and a 10% safety margin. Change them through **Kova: Open Settings** or VS Code settings JSON:

```json
{
  "kova.context.maxTokens": 32768,
  "kova.context.reservedOutputTokens": 4096,
  "kova.context.safetyMarginRatio": 0.1,
  "kova.ollama.think": true
}
```

Enable Ollama thinking for a model that reports thinking support, such as Qwen3. Kova receives thinking separately from the answer and displays a collapsed **Thinking** section. Leave it closed to see the label without the reasoning text. The answer appears below it. For DeepSeek, use `kova.deepseek.think`. These settings control generation; they do not rewrite earlier answers. Start **New conversation** after changing the setting to test it with empty history.

On the supplied Qwen3 installation, disabling thinking previously produced reasoning as ordinary answer text. Enabling the separate thinking stream avoids that presentation problem. Generic OpenAI-compatible thinking is disabled because wire formats differ between endpoints.

Thinking is transient and excluded from stored conversation history. The output limit also needs room for reasoning on models that count reasoning toward generated output. Larger local contexts use more memory; the selected model must support the configured maximum.

## Skills

A skill adds instructions to the selected run. Create `.kova/skills/code-review/SKILL.md` inside the project:

```markdown
---
name: code-review
description: Review changes for bugs and missing tests.
---

Inspect the Git diff and relevant files.
Report concrete bugs with file references and evidence.
Identify missing tests. Do not edit files.
```

The `name` must match the folder. Use a short plain-text description. After adding a new skill, run **Developer: Reload Window**, reopen Kova, and choose **code-review** from the **Skill** dropdown above the composer. Choose **Plan** for a read-only review and ask: `Review my current Git changes using the selected skill.` Choose **None** to clear the skill.

Skill selection uses the dropdown; `/skill` is treated as an ordinary chat message. Only the selected skill's body enters the model context. A ready-made ERS review skill is in [the ERS example](../examples/ers/.kova/skills/review-pull-request/SKILL.md).

## MCP

Kova supports local **stdio** MCP servers. Create `.kova/mcp.json` in the project root. For the ERS workspace, the existing example is:

```json
{
  "servers": {
    "ers": {
      "transport": "stdio",
      "command": "dotnet",
      "args": [
        "run",
        "--project",
        "src/EquipmentReservation.Mcp",
        "--configuration",
        "Release",
        "--no-build"
      ],
      "toolRisks": {
        "get_project_structure": "ReadOnly",
        "get_git_diff": "ReadOnly",
        "run_unit_tests": "ProcessExecution"
      }
    }
  }
}
```

Build the ERS solution in Release first. The paths above are relative to the open workspace; they must point to an actual MCP project. For a different server, replace `command` and `args` with its documented startup command. Declare `ReadOnly` only for tools you have reviewed as read-only; undeclared tools require process-level permission checks.

At the next run, Kova loads the configuration, starts changed servers and discovers their tools. Configuration is never reloaded during a run. Check **Activity** for **configuration reloaded**, server startup, tool calls and errors. Ask explicitly for the server's tools, for example: `Use the ERS MCP tools to inspect my Git diff and run unit tests, then summarize the results.` Approve the unit-test call in Manual mode.

The full [ERS walkthrough](../examples/ers/README.md) includes the review skill, MCP config and hooks. Remote HTTP/SSE transports are not supported.

## Modes and hooks

- **Plan:** read-only tools; no edits or commands.
- **Manual:** reads run directly; writes and processes need approval.
- **Edit:** ordinary workspace edits run directly; processes need approval.
- **Auto:** ordinary edits and exact allowlisted commands run directly; other operations require approval or are blocked.

Hooks are optional local programs configured in `.kova/hooks.json`. They can inspect tool execution. Every hook needs a timeout. A failing before-hook blocks the call; an after-hook failure is reported without reversing the result. Use the [ERS hook config](../examples/ers/.kova/hooks.json) with its [audit script](../examples/ers/scripts/kova-audit.mjs) as a complete example.

Configured MCP programs and hooks run with your user privileges. Use trusted programs and inspect file/process approvals before accepting them.
