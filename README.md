# Kova

<img src="https://raw.githubusercontent.com/owlCoder/kova/main/assets/logo.png" width="160" height="160" alt="Kova logo">

Kova is a local-first AI coding workspace for macOS, Windows, Linux and VS Code. It keeps Ollama as the default offline provider, while also supporting DeepSeek and configurable OpenAI-compatible APIs when you want a remote model.

The Electron desktop app brings projects, persistent sessions, file search and previews, working-tree diffs, streaming Markdown and a command palette into one workspace. The VS Code extension shares the same modern chat interface and agent runtime, with editor-aware context and undo. Both can inspect projects, edit files and run checked commands through the same permission and approval pipeline.

## Desktop

Build and start the native app with Node 24 and npm 11:

```sh
npm ci
npm run desktop:build
npm run desktop:start
```

Choose **Open project**, follow **Setup** to connect a provider, and start in Manual mode to review edits. **Settings → Provider** offers local/cloud presets, custom endpoints, model discovery or a manual model ID, tool/thinking controls and secure API-key storage. **Settings → Appearance** switches dark, light or system themes, sets a comfortable text size, and selects English, Serbian Latin or German. **About Kova** includes privacy details, shortcuts, local data access, help links and runtime diagnostics.

Sessions are saved locally and restored when reopening a project. Browse or search files with **Cmd/Ctrl+P**, inspect a proposed change before **Allow once**, attach files to context, and stop a run without losing the partial response. **Cmd/Ctrl+K** opens commands and sessions; **Cmd/Ctrl+N** starts a session; **Cmd/Ctrl+O** opens a project; **Cmd/Ctrl+,** opens settings. **Cmd/Ctrl+B** and **Cmd/Ctrl+J** toggle the side panels.

Open the built-in terminal with **Cmd/Ctrl+Shift+T**, **Ctrl+`**, or the title-bar terminal button. It starts your login shell (PowerShell on Windows) in the selected project and supports interactive CLI programs, Ctrl+C and resizing. Hide keeps the shell running; Close terminates it. Terminal commands are user-operated, run with your user privileges and are separate from AI approvals. Switching projects closes the old shell.

`npm run desktop:package` creates native installers for the current OS under `dist/installers`. The Desktop builds workflow packages macOS DMG/ZIP, Windows NSIS and Linux AppImage/DEB on their native runners. Local builds are unsigned; signing and notarization need release credentials. See [desktop setup and development](docs/DESKTOP.md).

## Providers

| Provider          | Default                           | API key  | Notes                                                                    |
| ----------------- | --------------------------------- | -------- | ------------------------------------------------------------------------ |
| Ollama            | `qwen3:4b`                        | No       | Local-first default. Can run fully offline after the model is installed. |
| DeepSeek          | `deepseek-flash`                  | Yes      | OpenAI-compatible API with DeepSeek thinking/tool-loop support.          |
| OpenAI-compatible | First discovered/configured model | Optional | For compatible hosted or local endpoints such as vLLM-style deployments. |

API keys use VS Code `SecretStorage` in the extension and Electron OS encryption in desktop. If OS secure storage is unavailable, desktop keeps the key in memory for the current app session. Keys never go into ordinary settings, workspace files or the repository.

## Get started

In VS Code, open Kova and follow the first-run **Setup** guide, or run **Kova: Set Up AI Provider**. The wizard offers Ollama, DeepSeek, OpenAI, OpenRouter, Groq, Gemini, LM Studio and a custom OpenAI-compatible endpoint. It asks for the endpoint, a securely stored API key when needed, and a chat model. A final review shows what will be saved. Escape cancels setup before saving.

Choose **Discover models** to check the connection using the model list, or **Enter model ID manually** for servers without `/models`. Manual mode checks the connection on the first prompt. Choose whether the model supports tools, then select a permission mode in the guide. **Set up later** dismisses the first-run guide; **Setup** in the header reopens it.

### Local demo with Qwen3 4B

1. Install and start [Ollama](https://ollama.com).
2. Install the default model: `ollama pull qwen3:4b`.
3. Install Kova from the Marketplace or from the generated VSIX.
4. Run **Kova: Open Chat** from the Command Palette.
5. Keep `kova.provider` set to `ollama`, select `qwen3:4b`, then choose a mode.

### DeepSeek or another API provider

1. Run **Kova: Set Up AI Provider** and choose a provider preset or custom endpoint.
2. Enter the endpoint and API key, then discover models or enter a model ID.
3. Choose tool support and accept the configuration review.
4. Use **Kova: Set Provider API Key** or **Kova: Clear Provider API Key** to manage the key for the selected endpoint.

Custom endpoints must support streaming OpenAI Chat Completions and bearer authentication when a key is needed. APIs using another wire format require a compatible gateway, such as OpenRouter for Claude models. Native Anthropic Messages and Azure-specific authentication are not implemented.

Open Kova from the Activity Bar or run **Kova: Open Chat**. For a movable tab alongside your code, run **Kova: Open Chat in Editor**. The sidebar and editor tab share the same conversation. Closing the editor tab stops active work; hiding the sidebar keeps the run active.

## Privacy and network behavior

Kova does not silently switch providers. `ollama` is the default and sends requests only to the configured Ollama endpoint, which defaults to `http://127.0.0.1:11434`.

When you explicitly select DeepSeek or an OpenAI-compatible provider, prompts, selected conversation context, tool definitions and tool results needed for the active request are sent to that configured API endpoint. Provider credentials are read from the host’s secure key store and are not added to model context, logs or workspace configuration.

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

Read files, list directories, search text, inspect Git diffs, create files, replace one exact text match and run checked commands. Built-in file tools stay inside the selected workspace. Extension changes support VS Code Undo; desktop writes use atomic replacement and stale-version checks.

Use **Add context** to attach a selection, the current file or chosen files. When chat has focus, selection and current-file attachments use the most recently active file editor. Kova does not index the workspace in the background.

**Stop** cancels generation, pending approval or a running process. Applied changes remain. **New session** starts a separate chat. Desktop history is saved locally; extension history lasts for the current extension session. Desktop sessions can be renamed or archived from the sidebar; archived files remain in the local data directory.

## Context and settings

The default context budget is 32,768 tokens, with 4,096 reserved for output and a 10% safety margin. The context indicator shows estimated input before generation and measured input/output afterwards. Tool-definition cost remains an estimate. Larger local contexts require more memory; explicit VS Code settings override these defaults.

Run **Kova: Open Settings** to change provider settings, `kova.ui.language` (`en`, `sr`, `de`) and `kova.ui.textSize` (`standard`, `large`, `larger`):

| Setting                                | Default                      |
| -------------------------------------- | ---------------------------- |
| `kova.provider`                        | `ollama`                     |
| `kova.ollama.baseUrl`                  | `http://127.0.0.1:11434`     |
| `kova.ollama.model`                    | `qwen3:4b`                   |
| `kova.ollama.think`                    | `false`                      |
| `kova.ollama.keepAliveSeconds`         | `300`                        |
| `kova.deepseek.baseUrl`                | `https://api.deepseek.com`   |
| `kova.deepseek.model`                  | `deepseek-flash`             |
| `kova.deepseek.think`                  | `false`                      |
| `kova.openaiCompatible.baseUrl`        | `http://127.0.0.1:8000/v1`   |
| `kova.openaiCompatible.model`          | empty; use discovered model  |
| `kova.openaiCompatible.supportsTools`  | `true`                       |
| `kova.openaiCompatible.name`           | `OpenAI-compatible provider` |
| `kova.openaiCompatible.discoverModels` | `true`                       |
| `kova.context.maxTokens`               | `32768`                      |
| `kova.context.reservedOutputTokens`    | `4096`                       |
| `kova.context.safetyMarginRatio`       | `0.1`                        |
| `kova.commands.allow`                  | Exact command list           |

Generic OpenAI-compatible thinking is disabled because reasoning wire formats are not standardized. Auto allowlisting matches the whole command; chaining, pipes, redirection, substitutions and backticks never match.

Model metadata is cached for 60 seconds; **Retry** and configuration changes refresh it immediately. Ollama metadata loads with at most four concurrent requests. Stream updates are coalesced over 32 ms to reduce Webview messaging and rendering work; completion and approval events flush pending text immediately.

## Project rules, skills, MCP and hooks

Put the rules every run should follow in `AGENTS.md` at the workspace root: architecture boundaries, naming, how to build and test. Kova adds that text to each run ahead of the selected skill and lists **Project rules · AGENTS.md** in the activity view. Nothing has to be configured, and edits apply from the next run. The file is limited to 16,000 bytes of plain text; project rules guide the model and cannot grant permissions or change modes, hooks or guardrails.

Select a skill from `.kova/skills/<id>/SKILL.md`; only its selected body enters context. Configure local stdio MCP servers in `.kova/mcp.json` and command hooks in `.kova/hooks.json`. MCP tools use the same permission and guardrail pipeline as built-in tools. Configuration changes take effect between runs.

See the [usage guide](https://github.com/owlCoder/kova/blob/main/docs/USAGE.md) for project rules, skill and MCP examples, thinking display and permission modes.

Use trusted projects. Configured MCP servers, hooks and project scripts run with your user privileges. They are not sandboxed. Kova adds no separate workspace-trust prompt. Writes to `.kova/mcp.json`, `.kova/hooks.json`, `.git/**` and `.vscode/**` require approval.

## Requirements

- Desktop: macOS, Windows or Linux with Electron support; native installers are built per OS.
- Extension: VS Code 1.100 or newer.
- For the default local mode: Ollama and an installed model such as Qwen3 4B.
- For DeepSeek: a valid DeepSeek API key.
- For OpenAI-compatible mode: a compatible streaming Chat Completions endpoint; model-list discovery and authentication are optional depending on the server.
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

Press F5 in VS Code to launch the development extension. Packaging writes `dist/kova-local-<version>.vsix`, using the name and version in `packages/vscode/extension.package.json`. The Marketplace extension identifier is `owlcoder.kova-local`; the current extension release is `0.5.0`.

Use `npm run desktop:dev` for Vite hot reload and automatic main/preload rebuilds. `desktop:verify` checks the production desktop bundle; `desktop:smoke` starts an isolated native UI fixture without external AI calls. Extension integration checks are `smoke:ollama`, `smoke:vscode`, `smoke:vsix` and `smoke:ers`.

## Marketplace publishing

Publishing is intentionally manual. Build and verify the exact archive you intend to upload:

```sh
npm ci
npm run check
npm run package
npm run verify:package
```

Then upload `dist/kova-local-0.5.0.vsix` through the Visual Studio Marketplace publisher management portal for publisher `owlcoder`. No Marketplace PAT, repository secret or automatic publish workflow is required.

[Setup](https://github.com/owlCoder/kova/blob/main/docs/SETUP.md) · [Providers](https://github.com/owlCoder/kova/blob/main/docs/PROVIDERS.md) · [Architecture](https://github.com/owlCoder/kova/blob/main/docs/ARCHITECTURE.md) · [Marketplace release](https://github.com/owlCoder/kova/blob/main/docs/MARKETPLACE.md) · [Release checks](https://github.com/owlCoder/kova/blob/main/docs/TESTING.md)

MIT licensed.
