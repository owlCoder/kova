# Kova

Kova is a local coding assistant for VS Code. It uses Ollama to answer questions, review code and make approved changes in your workspace. No account or API key is required. After installing a model, chat runs without an internet connection.

## Get started

1. Install and start Ollama.
2. Install a model with tool support, such as `ollama pull qwen3:4b`.
3. Install Kova, then run **Kova: Open Chat** from the Command Palette.
4. Select a model and mode. Enter a prompt or attach code with the **+** menu.

Kova lists models already installed in Ollama. It does not download models. Models without confirmed tool support are available for chat only.

## Modes

| Mode   | Behavior                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| Plan   | Read-only tools. No edits or commands.                                                                      |
| Manual | Reads run automatically. Edits and commands require approval.                                               |
| Edit   | Ordinary workspace edits run automatically. Commands require approval.                                      |
| Auto   | Ordinary workspace edits and exact allowlisted commands run automatically. Other commands require approval. |

Protected configuration writes always require approval. Destructive commands are blocked in every mode. Approvals apply once to the specific prepared operation. If a file changes after its preview, Kova refuses the stale write.

## Workspace tools

Kova can read files, list directories, search text, inspect Git diffs, create files, replace one exact text match, and run checked commands. Built-in file tools stay inside the selected workspace. File changes use VS Code's editor operations and support Undo.

Attach the current selection, current file or chosen files explicitly. Kova does not index or upload the workspace in the background. Use **Stop** to cancel generation, pending approval or a running process. Applied changes remain after cancellation.

## Models and context

The default context window is 8,192 tokens, with 1,024 tokens reserved for output and a 10% safety margin. Kova sends the configured context size explicitly to Ollama. The context indicator shows estimated input before generation and actual input/output usage after it finishes; tool-definition cost remains an estimate.

Thinking is off by default. If Qwen3 prints reasoning instead of calling tools, enable Thinking in Kova settings. Supported models can stream it in a separate collapsed view. Thinking is not saved in conversation history. Conversations are held in memory for the current extension session; **New conversation** clears the previous chat.

## Settings

Open **Kova: Open Settings** to configure:

| Setting                             | Default                     |
| ----------------------------------- | --------------------------- |
| `kova.ollama.baseUrl`               | `http://127.0.0.1:11434`    |
| `kova.ollama.model`                 | `qwen3:4b`                  |
| `kova.ollama.think`                 | `false`                     |
| `kova.ollama.keepAliveSeconds`      | `300`                       |
| `kova.context.maxTokens`            | `8192`                      |
| `kova.context.reservedOutputTokens` | `1024`                      |
| `kova.context.safetyMarginRatio`    | `0.1`                       |
| `kova.commands.allow`               | Exact reviewed command list |

Auto allowlisting matches the whole command. Pipes, command chaining, redirection, substitutions and backticks never match. Project scripts still execute with your user privileges.

## Skills, MCP and hooks

Select one skill from `.kova/skills/<id>/SKILL.md`. The file needs `name` and `description` frontmatter; only the selected body is sent to the model. Skills cannot grant permissions.

Configure local stdio MCP servers in `.kova/mcp.json` and command hooks in `.kova/hooks.json`. MCP tools pass through the same permission and guardrail pipeline as built-in tools. Pre-hook failures veto the tool; post-hook failures are reported without changing its result. Config changes take effect at the next idle run start, with a visible activity entry.

Use Kova only in projects you trust. Configured MCP servers and hooks execute local code without an additional Kova trust prompt. Auto, hooks and MCP are not OS sandboxes. Agent writes to `.kova/mcp.json`, `.kova/hooks.json`, `.git/**` and `.vscode/**` require approval in every mode.

## Requirements and limitations

- VS Code 1.100 or newer and a running Ollama instance.
- A local model; `qwen3:4b` is the verified default.
- Git for diff tools, and the relevant runtime for configured commands/MCP servers.
- One workspace root per extension session, selected at activation.

Model answers and command classification can be wrong. Check diffs and test results before accepting changes. Process/MCP side effects cannot be undone by cancelling the run. Native integration has been verified on macOS; other platforms need a release smoke check.

## Development

Requires Node 24 and npm 11:

```sh
npm ci
npm run check
npm run build
npm run package
```

Press F5 in VS Code to run the development extension. The package is written to `dist/kova-0.1.0.vsix`. Local integration checks are available as `smoke:ollama`, `smoke:vscode` and `smoke:ers`; they require the corresponding installed runtimes.

MIT licensed.
