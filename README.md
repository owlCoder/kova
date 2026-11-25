# Kova

<img src="https://raw.githubusercontent.com/owlCoder/kova/main/assets/logo.png" width="112" height="112" alt="Kova logo">

**Your code. Your models. Your workspace.**

Kova is an open-source, local-first AI coding agent for **VS Code**. Run a model locally with Ollama or connect a compatible API, then work with your project in an agent chat tab beside your code: ask, plan, let Kova read and edit files or run commands, and approve each change inline.

[![Checks](https://github.com/owlCoder/kova/actions/workflows/ci.yml/badge.svg)](https://github.com/owlCoder/kova/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/owlCoder/kova)](https://github.com/owlCoder/kova/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/owlCoder/kova/blob/main/LICENSE)

[Download](https://github.com/owlCoder/kova/releases/latest) · [Quick start](#quick-start) · [Documentation](#documentation) · [Contribute](CONTRIBUTING.md) · [Report a bug](https://github.com/owlCoder/kova/issues/new/choose)

## What you can do

- **Chat beside your code.** Kova opens as an editor tab next to the current file; the Activity Bar icon is a small launcher with the connection status and quick actions. Set `kova.chat.openIn` to `sidebar` to keep the conversation in the Activity Bar view instead.
- **Work in an agent transcript.** Answers stream as plain text; every tool call appears inline as one line (`● Read src/App.cs`, `● Run dotnet test`) with its result folded underneath, and rules, hooks, MCP events and interruptions appear as short notes, so you can follow what Kova did and open any output. Code blocks get local syntax highlighting (C#, TypeScript/JavaScript, Python, Bash, SQL, JSON, YAML, XML, diff) that follows your theme, rendered safely as text — never as raw HTML.
- **Approve inline.** File changes and commands stop at a permission prompt in the transcript: press **1** to allow once, **2** or **Esc** to reject, or open the diff first.
- **Choose how much Kova may do.** Switch between _Ask before changes_, _Accept edits_, _Auto mode_ and _Plan mode_ with **Shift+Tab** or the mode menu in the composer. **Esc** interrupts a running task.
- **Work locally or connect an API.** Ollama is the default. Guided setup also offers DeepSeek, OpenAI, OpenRouter, Groq, Gemini, LM Studio and custom OpenAI-compatible endpoints. Connection problems show as a banner above the composer with Retry.
- **Give it context.** Right-click files in the Explorer and choose **Add to Kova Context**, or attach the editor selection, the current file or chosen files from the composer menu; preview each snapshot before sending. The context budget defaults to 200,000 tokens and is capped to what the model supports; a ring in the composer shows how full it is.
- **Keep your work.** Search the conversation with Cmd/Ctrl+F, export or copy a Markdown transcript, and restore unsent drafts after reopening.
- **Use slash commands.** Type `/` in the composer for commands like `/clear` (new conversation), `/compact` (summarize older messages and free context), `/export`, `/copy`, `/model`, `/mode`, `/context`, `/prompts`, `/settings` and `/help`; arrows and Enter pick one, Esc dismisses the menu.
- **Build your prompt library.** Open the prompt menu in the composer for saved prompts, localized templates and recent messages; **Manage…** opens the full library editor.
- **Tune Kova in its own settings dialog.** The gear in the chat header, Cmd/Ctrl+, or the command palette opens Kova settings: interface language, text size, where the chat opens, context budget, Ollama options and the Auto-mode command allowlist. The same options remain available as `kova.*` VS Code settings (see [configuration reference](docs/CONFIGURATION.md)).
- **Extend the workflow.** Add project `AGENTS.md` rules, selected skills, local stdio MCP servers and command hooks.
- **Feel native.** The chat uses your VS Code theme (including light and high-contrast), fonts and colors; English, Serbian Latin and German; keyboard navigation and reduced-motion support. Menus open above the composer, close on outside click and never overlap each other.

Kova has no required account or subscription. Local models run offline once downloaded; hosted providers apply their own authentication, pricing and data policies.

## Install

Download `kova-local-<version>.vsix` from the [latest release](https://github.com/owlCoder/kova/releases/latest) and run **Extensions: Install from VSIX…** in VS Code 1.100 or later. `SHA256SUMS` accompanies each release so you can check file integrity.

## Quick start

1. Install and start [Ollama](https://ollama.com), then download a model:

   ```sh
   ollama pull qwen3:4b
   ```

2. Open a folder in VS Code and run **Kova: Open Chat** (Cmd+Alt+K / Ctrl+Alt+K), click the Kova icon in the editor title bar, or use the Kova launcher in the Activity Bar. Kova opens as an editor tab beside your code, so the Explorer stays free; set `kova.chat.openIn` to `sidebar` to use the Activity Bar view instead.
3. Follow **Setup** to connect Ollama and select `qwen3:4b`. For a hosted model, run **Kova: Set Up AI Provider**, choose the provider and supply your API key (**Kova: Set Provider API Key** changes it later).
4. Start in _Ask before changes_. Ask Kova to explain the project, attach relevant files, then review a proposed edit before pressing **1**.

### Provider compatibility

| Provider mode     | Connection                                                                     | Credentials             |
| ----------------- | ------------------------------------------------------------------------------ | ----------------------- |
| Ollama            | Native Ollama API; defaults to `http://127.0.0.1:11434`, model chosen in setup | None                    |
| DeepSeek          | Chat Completions with DeepSeek thinking/tool continuation support              | API key                 |
| OpenAI-compatible | Streaming Chat Completions; optional model discovery and function calling      | Optional bearer API key |

Presets configure endpoints; they do not guarantee that every model supports tools. Native Anthropic Messages and Azure-specific authentication require a compatible gateway. See [provider details](docs/PROVIDERS.md).

### Permissions

| Mode (protocol name)          | Behavior                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| Plan mode (`Plan`)            | Read-only tools; no edits or commands.                                                            |
| Ask before changes (`Manual`) | Reads run automatically; edits and commands require approval.                                     |
| Accept edits (`Edit`)         | Ordinary workspace edits run automatically; commands require approval.                            |
| Auto mode (`Auto`)            | Ordinary edits and exact allowlisted commands run automatically; other commands require approval. |

Protected configuration writes require approval in every mode. Destructive commands recognized by the guardrails are blocked. Approvals apply once to the prepared operation; a file changed after preview requires another preview. Interrupting cancels active work and preserves partial output; it does not undo completed changes or process effects.

| Shortcut       | Action                       |
| -------------- | ---------------------------- |
| Enter          | Send                         |
| Shift+Enter    | New line                     |
| Shift+Tab      | Switch permission mode       |
| Esc            | Interrupt the running task   |
| 1 / 2          | Allow once / reject a prompt |
| Cmd/Ctrl+Alt+K | Open Kova                    |
| Cmd/Ctrl+K     | Commands                     |
| Cmd/Ctrl+F     | Find in the conversation     |
| Cmd/Ctrl+,     | Kova settings dialog         |

## Privacy and trust

- **You select the endpoint.** Kova never silently switches providers. Prompts, selected context, tool definitions and results needed for a task go to the configured provider. Model discovery requests metadata without sending project content.
- **Credentials stay separate.** API keys live in VS Code `SecretStorage`, never in ordinary settings or model context.
- **Project access is explicit.** Built-in file tools stay inside the open workspace. Kova does not background-index your project. File edits support VS Code Undo.
- **Use trusted projects.** Approved commands, configured hooks and MCP servers run with your user privileges. They are not an OS sandbox, and model output or command classification can be wrong.

See [tool policy](docs/TOOLS-AND-POLICY.md) and the [security reporting policy](SECURITY.md).

## Build from source

Use **Node.js 24** and **npm 11**.

```sh
git clone https://github.com/owlCoder/kova.git
cd kova
npm ci
npm run check
```

Press **F5** in this repository to start the extension development host, or package a VSIX:

```sh
npm run package
npm run verify:package
```

The package is written to `dist/kova-local-<version>.vsix`. CI runs type checking, linting, formatting and deterministic tests and verifies the VSIX.

### Project layout

| Directory           | Responsibility                                                  |
| ------------------- | --------------------------------------------------------------- |
| `packages/core`     | Host-independent agent, context, tools and permission contracts |
| `packages/runtime`  | Node.js adapters, workspace tools and provider composition      |
| `packages/vscode`   | Editor integration and extension host                           |
| `packages/ollama`   | Ollama, DeepSeek and compatible API adapters                    |
| `packages/mcp`      | Local stdio MCP integration                                     |
| `packages/protocol` | Data contracts between the extension host and the panel         |
| `webview`           | React agent panel and translations                              |
| `tests`             | Unit, architecture and runtime coverage                         |

## Documentation

- [Setup](docs/SETUP.md) and [usage, project rules, skills, MCP and hooks](docs/USAGE.md)
- [Provider compatibility](docs/PROVIDERS.md) and [configuration reference](docs/CONFIGURATION.md)
- [Architecture](docs/ARCHITECTURE.md) and [design decisions](docs/adr/README.md)
- [Testing](docs/TESTING.md), [release process](docs/RELEASING.md) and [Marketplace publishing](docs/MARKETPLACE.md)
- [Changelog](CHANGELOG.md)

## Contributing and support

Bug reports, focused pull requests, translations and accessibility improvements are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Use [GitHub Issues](https://github.com/owlCoder/kova/issues/new/choose) for bugs, feature proposals and usage questions. Include the extension version, VS Code version and OS, and remove secrets and private project content from diagnostics.

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/owlCoder/kova/security/advisories/new), following [SECURITY.md](SECURITY.md).

## License

Kova is available under the [MIT License](LICENSE). The VSIX includes third-party dependency notices. Model weights, provider services, external tools and their names remain subject to their own licenses and terms.
