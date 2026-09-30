# Kova

<img src="https://raw.githubusercontent.com/owlCoder/kova/main/assets/logo.png" width="160" height="160" alt="Kova logo">

Kova is a local coding assistant for VS Code, powered by Ollama. Chat opens in the Kova sidebar, with an optional editor tab. Ask questions, review changes and edit files with workspace tools and approval controls.

No account or API key is required. Once a model is installed, chat can run offline.

## Get started

1. Install and start [Ollama](https://ollama.com).
2. Install a model: `ollama pull qwen3:4b`.
3. Install the Kova VSIX with **Extensions: Install from VSIX**.
4. Run **Kova: Open Chat** from the Command Palette, then select a model and mode.

Open Kova from the Activity Bar or run **Kova: Open Chat**. For a tab alongside your code, run **Kova: Open Chat in Editor**. The sidebar and editor tab share the same conversation. The tab can move between editor groups; opening it again focuses the existing tab. Closing the tab stops active work. Hiding the sidebar keeps the run active.

Kova lists models installed in Ollama. Models without confirmed tool support are available for chat only. For tool use with the verified Qwen3 installation, enable **Thinking** in Kova settings.

## Modes

| Mode   | Behavior                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| Plan   | Read-only tools. No edits or commands.                                                                      |
| Manual | Reads run automatically. Edits and commands require approval.                                               |
| Edit   | Ordinary workspace edits run automatically. Commands require approval.                                      |
| Auto   | Ordinary workspace edits and exact allowlisted commands run automatically. Other commands require approval. |

Protected configuration writes require approval in every mode. Destructive commands are blocked. Approvals apply once to the prepared operation; a file changed after preview requires a new preview.

## Workspace tools

Read files, list directories, search text, inspect Git diffs, create files, replace one exact text match and run checked commands. Built-in file tools stay inside the selected workspace. Changes support VS Code Undo.

Use **Add context** to attach a selection, the current file or chosen files. When chat has focus, selection and current-file attachments use the most recently active file editor. Kova does not index the workspace in the background.

**Stop** cancels generation, pending approval or a running process. Applied changes remain. **New conversation** clears the chat. Conversation history lasts for the current extension session.

## Context and settings

The default context window is 8,192 tokens, with 1,024 reserved for output and a 10% safety margin. The context indicator shows estimated input before generation and measured input/output afterwards. Tool-definition cost remains an estimate. Thinking is off by default, appears separately when supported and is excluded from conversation history.

Run **Kova: Open Settings** to change:

| Setting                             | Default                  |
| ----------------------------------- | ------------------------ |
| `kova.ollama.baseUrl`               | `http://127.0.0.1:11434` |
| `kova.ollama.model`                 | `qwen3:4b`               |
| `kova.ollama.think`                 | `false`                  |
| `kova.ollama.keepAliveSeconds`      | `300`                    |
| `kova.context.maxTokens`            | `8192`                   |
| `kova.context.reservedOutputTokens` | `1024`                   |
| `kova.context.safetyMarginRatio`    | `0.1`                    |
| `kova.commands.allow`               | Exact command list       |

Auto allowlisting matches the whole command. Chaining, pipes, redirection, substitutions and backticks never match.

## Skills, MCP and hooks

Select a skill from `.kova/skills/<id>/SKILL.md`; only its selected body enters context. Configure local stdio MCP servers in `.kova/mcp.json` and command hooks in `.kova/hooks.json`. MCP tools use the same permission and guardrail pipeline as built-in tools. Configuration changes take effect between runs.

Use trusted projects. Configured MCP servers, hooks and project scripts run with your user privileges. They are not sandboxed. Kova adds no separate workspace-trust prompt. Writes to `.kova/mcp.json`, `.kova/hooks.json`, `.git/**` and `.vscode/**` require approval.

## Requirements

- VS Code 1.100 or newer, Ollama and an installed local model.
- Git for diff tools, plus runtimes needed by project commands and MCP servers.
- One workspace root per extension session, selected at activation.

Native integration is verified on macOS. Windows and Linux need native release checks. Model output and command classification can be wrong; inspect changes and test results. Cancellation cannot undo completed process or MCP effects.

## Development

Requires Node 24 and npm 11:

```sh
npm ci
npm run check
npm run package
npm run verify:package
```

Press F5 in VS Code to launch the development extension. Packaging writes `dist/kova-<version>.vsix`, using the version in the extension manifest. The current release is `0.2.0`. Local integration checks are `smoke:ollama`, `smoke:vscode`, `smoke:vsix` and `smoke:ers`.

[Setup](https://github.com/owlCoder/kova/blob/main/docs/SETUP.md) · [Architecture](https://github.com/owlCoder/kova/blob/main/docs/ARCHITECTURE.md) · [Release checks](https://github.com/owlCoder/kova/blob/main/docs/TESTING.md)

MIT licensed. The VSIX is prepared for distribution; it has not been published to the Marketplace.
