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

## Project rules

When the workspace root contains `AGENTS.md`, Kova adds its text to the system instructions of every run, before the selected skill. No setting or reference from a skill is needed, and the activity list shows **Project rules · AGENTS.md** for each run that used it. Edits apply to the next run without reloading the window.

The file must be plain text of at most 16,000 bytes and must resolve inside the workspace; otherwise it is skipped and Kova reports the reason. Project rules guide the model only. They cannot grant permissions or change the selected mode, hooks or guardrails.

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

## Review attached context

Click an attachment to preview its captured text, source and character count. The separate remove control detaches it; opening a preview does not. Previews display up to 50,000 characters and do not change the stored attachment. The model's context budget can shorten the content used for a task. Reattach the file to refresh its snapshot. Multi-file selection commits only after all chosen files pass validation. Starting a new conversation clears attached context.

## Long conversations

The interface initially renders the latest 40 saved messages. Load earlier messages in batches of 40 while keeping your reading position, or choose Show recent to return to the end. Find in conversation loads the saved messages in the current snapshot, including those initially outside the rendered window. Closing Find keeps those messages available until you choose Show recent or change conversations. Rendering limits do not change the agent's context-compaction policy.

## Personal prompt library

Open **Prompt library** from the composer or command palette. **Saved** contains your own reusable prompts; **Templates** has six translated starting points; **Recent** shows up to 12 distinct user messages from the current conversation. Search the selected collection by title or content.

- Choose **New prompt**, **Save draft**, or **Save prompt** on a user message. You can also save an editable copy of a template or recent message.
- Keep up to 40 prompts, each with a title up to 80 characters and text up to 16,000 characters. Editing preserves code whitespace and line breaks.
- Click a prompt to insert it at the composer caret. Existing text and the selected mode remain; nothing is sent automatically.
- Edit or remove a saved prompt. **Undo removal** restores the latest removed prompt while the library remains open. Closing it ends that undo opportunity.

Desktop libraries belong to the local app profile and remain available across projects. VS Code libraries use local workspace storage and are shared by that workspace's sidebar and chat tab. Starting a new conversation keeps saved prompts. No library text enters routine conversation snapshots or model requests automatically. Local prompt storage is ordinary application data, separate from credentials; libraries are not synchronized between desktop and VS Code.

Clipboard controls show **Copied** only after the host confirms a successful write. Messages/code over the 60,000-character clipboard limit have a selection-copy hint; select a smaller portion for native copy.
