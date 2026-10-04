# Kova

<img src="https://raw.githubusercontent.com/owlCoder/kova/main/assets/logo.png" width="160" height="160" alt="Kova logo">

Kova is a local-first AI coding agent for VS Code. It keeps Ollama as the default offline provider, while also supporting DeepSeek and configurable OpenAI-compatible APIs when you want a remote model.

Kova opens in the Activity Bar sidebar, with an optional editor tab. It can answer questions, inspect workspace context, edit files and run checked commands through the same permission and approval pipeline regardless of the selected model provider.

## Providers

| Provider          | Default                           | API key  | Notes                                                                    |
| ----------------- | --------------------------------- | -------- | ------------------------------------------------------------------------ |
| Ollama            | `qwen3:4b`                        | No       | Local-first default. Can run fully offline after the model is installed. |
| DeepSeek          | `deepseek-flash`                  | Yes      | OpenAI-compatible API with DeepSeek thinking/tool-loop support.          |
| OpenAI-compatible | First discovered/configured model | Optional | For compatible hosted or local endpoints such as vLLM-style deployments. |

API keys are stored with VS Code `SecretStorage`, not in `settings.json`, workspace files or the repository.

## Get started

### Local demo with Qwen3 4B

1. Install and start [Ollama](https://ollama.com).
2. Install the default model: `ollama pull qwen3:4b`.
3. Install Kova from the Marketplace or from the generated VSIX.
4. Run **Kova: Open Chat** from the Command Palette.
5. Keep `kova.provider` set to `ollama`, select `qwen3:4b`, then choose a mode.

### DeepSeek or another API provider

1. Open **Kova: Open Settings** and change `kova.provider` to `deepseek` or `openaiCompatible`.
2. Configure the provider endpoint/model if needed.
3. Run **Kova: Set Provider API Key** when the endpoint requires authentication.
4. Use **Kova: Clear Provider API Key** to remove the stored credential.

Open Kova from the Activity Bar or run **Kova: Open Chat**. For a movable tab alongside your code, run **Kova: Open Chat in Editor**. The sidebar and editor tab share the same conversation. Closing the editor tab stops active work; hiding the sidebar keeps the run active.

## Privacy and network behavior

Kova does not silently switch providers. `ollama` is the default and sends requests only to the configured Ollama endpoint, which defaults to `http://127.0.0.1:11434`.

When you explicitly select DeepSeek or an OpenAI-compatible provider, prompts, selected conversation context, tool definitions and tool results needed for the active request are sent to that configured API endpoint. Provider credentials are read from VS Code `SecretStorage` and are not added to model context, logs or workspace configuration.

Thinking/reasoning is displayed separately when supported and is not persisted in Kova conversation history. DeepSeek reasoning required for a thinking + tool-call continuation is kept only as transient in-memory provider state for that conversation.

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

The default context budget is 32,768 tokens, with 4,096 reserved for output and a 10% safety margin. The context indicator shows estimated input before generation and measured input/output afterwards. Tool-definition cost remains an estimate. Larger local contexts require more memory; explicit VS Code settings override these defaults.

Run **Kova: Open Settings** to change:

| Setting                               | Default                     |
| ------------------------------------- | --------------------------- |
| `kova.provider`                       | `ollama`                    |
| `kova.ollama.baseUrl`                 | `http://127.0.0.1:11434`    |
| `kova.ollama.model`                   | `qwen3:4b`                  |
| `kova.ollama.think`                   | `false`                     |
| `kova.ollama.keepAliveSeconds`        | `300`                       |
| `kova.deepseek.baseUrl`               | `https://api.deepseek.com`  |
| `kova.deepseek.model`                 | `deepseek-flash`            |
| `kova.deepseek.think`                 | `false`                     |
| `kova.openaiCompatible.baseUrl`       | `http://127.0.0.1:8000/v1`  |
| `kova.openaiCompatible.model`         | empty; use discovered model |
| `kova.openaiCompatible.supportsTools` | `true`                      |
| `kova.context.maxTokens`              | `32768`                     |
| `kova.context.reservedOutputTokens`   | `4096`                      |
| `kova.context.safetyMarginRatio`      | `0.1`                       |
| `kova.commands.allow`                 | Exact command list          |

Generic OpenAI-compatible thinking is disabled because reasoning wire formats are not standardized. Auto allowlisting matches the whole command; chaining, pipes, redirection, substitutions and backticks never match.

## Project rules, skills, MCP and hooks

Put the rules every run should follow in `AGENTS.md` at the workspace root: architecture boundaries, naming, how to build and test. Kova adds that text to each run ahead of the selected skill and lists **Project rules · AGENTS.md** in the activity view. Nothing has to be configured, and edits apply from the next run. The file is limited to 16,000 bytes of plain text; project rules guide the model and cannot grant permissions or change modes, hooks or guardrails.

Select a skill from `.kova/skills/<id>/SKILL.md`; only its selected body enters context. Configure local stdio MCP servers in `.kova/mcp.json` and command hooks in `.kova/hooks.json`. MCP tools use the same permission and guardrail pipeline as built-in tools. Configuration changes take effect between runs.

See the [usage guide](https://github.com/owlCoder/kova/blob/main/docs/USAGE.md) for project rules, skill and MCP examples, thinking display and permission modes.

Use trusted projects. Configured MCP servers, hooks and project scripts run with your user privileges. They are not sandboxed. Kova adds no separate workspace-trust prompt. Writes to `.kova/mcp.json`, `.kova/hooks.json`, `.git/**` and `.vscode/**` require approval.

## Requirements

- VS Code 1.100 or newer.
- For the default local mode: Ollama and an installed model such as Qwen3 4B.
- For DeepSeek: a valid DeepSeek API key.
- For OpenAI-compatible mode: a compatible `/models` + Chat Completions endpoint; authentication is optional depending on the server.
- Git for diff tools, plus runtimes needed by project commands and MCP servers.
- One workspace root per extension session, selected at activation.

Native integration is verified on macOS. Windows and Linux still need native release checks before being claimed as verified platforms. Model output and command classification can be wrong; inspect changes and test results. Cancellation cannot undo completed process or MCP effects.

## Development

Requires Node 24 and npm 11:

```sh
npm ci
npm run check
npm run package
npm run verify:package
```

Press F5 in VS Code to launch the development extension. Packaging writes `dist/kova-local-<version>.vsix`, using the name and version in `packages/vscode/extension.package.json`. The Marketplace extension identifier is `owlcoder.kova-local`; the current extension release is `0.3.2`.

Local integration checks are `smoke:ollama`, `smoke:vscode`, `smoke:vsix` and `smoke:ers`.

## Marketplace publishing

Publishing is intentionally manual. Build and verify the exact archive you intend to upload:

```sh
npm ci
npm run check
npm run package
npm run verify:package
```

Then upload `dist/kova-local-0.3.2.vsix` through the Visual Studio Marketplace publisher management portal for publisher `owlcoder`. No Marketplace PAT, repository secret or automatic publish workflow is required.

[Setup](https://github.com/owlCoder/kova/blob/main/docs/SETUP.md) · [Providers](https://github.com/owlCoder/kova/blob/main/docs/PROVIDERS.md) · [Architecture](https://github.com/owlCoder/kova/blob/main/docs/ARCHITECTURE.md) · [Marketplace release](https://github.com/owlCoder/kova/blob/main/docs/MARKETPLACE.md) · [Release checks](https://github.com/owlCoder/kova/blob/main/docs/TESTING.md)

MIT licensed.
