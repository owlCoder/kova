# Kova

<img src="https://raw.githubusercontent.com/owlCoder/kova/main/assets/logo.png" width="112" height="112" alt="Kova logo">

**Your code. Your models. Your workspace.**

Kova is an open-source, local-first AI coding workspace for **macOS, Windows, Linux and VS Code**. Run a model locally with Ollama, connect a compatible API, and work with your project through chat, file tools, reviewed changes and an integrated desktop terminal.

[![Checks](https://github.com/owlCoder/kova/actions/workflows/ci.yml/badge.svg)](https://github.com/owlCoder/kova/actions/workflows/ci.yml)
[![Desktop builds](https://github.com/owlCoder/kova/actions/workflows/desktop.yml/badge.svg)](https://github.com/owlCoder/kova/actions/workflows/desktop.yml)
[![Release](https://img.shields.io/github/v/release/owlCoder/kova)](https://github.com/owlCoder/kova/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/owlCoder/kova/blob/main/LICENSE)

[Download](https://github.com/owlCoder/kova/releases/latest) · [Quick start](#quick-start) · [Documentation](#documentation) · [Contribute](CONTRIBUTING.md) · [Report a bug](https://github.com/owlCoder/kova/issues/new/choose)

![Kova Desktop with the light theme, guided setup and project browser in Serbian Latin](https://raw.githubusercontent.com/owlCoder/kova/main/docs/images/desktop-light.jpg)

## What you can do

- **Work locally or connect an API.** Ollama is the default. Guided setup also offers DeepSeek, OpenAI, OpenRouter, Groq, Gemini, LM Studio and custom OpenAI-compatible endpoints.
- **Find and keep your work.** Search conversation text and code with Cmd/Ctrl+F, export or copy a Markdown transcript, and restore unsent drafts after reopening.
- **Keep a project workspace.** Desktop brings persistent sessions, file browsing and search, context attachments, working-tree diffs, tool activity and a command palette together.
- **Review the work.** Inspect proposed file changes and commands, approve once, reject or stop a run. Choose Plan, Manual, Edit or Auto permissions for each task.
- **Use your own CLI tools.** The desktop terminal runs your login shell or PowerShell with interactive programs, Ctrl+C, resizing and bounded scrollback.
- **Stay in your editor.** The VS Code sidebar and movable chat tab share a conversation, use editor selections as context and support Undo for file edits.
- **Make it comfortable.** Dark, light and system themes; three text sizes; English, Serbian Latin and German; keyboard navigation and reduced-motion support.
- **Keep sessions organized.** Pin important desktop conversations, archive finished work and restore it later. Browse sessions within each project.
- **Start with a useful prompt.** Six localized templates and recent messages from the current conversation are available in both hosts. Reuse a prompt without overwriting your draft.
- **Extend the workflow.** Add project `AGENTS.md` rules, selected skills, local stdio MCP servers and command hooks.

The Electron app and VS Code extension share one agent runtime and React interface. Kova has no required Kova account or subscription. Local models run offline once downloaded; hosted providers apply their own authentication, pricing and data policies.

## Download and install

Get the installers and extension from the [latest GitHub release](https://github.com/owlCoder/kova/releases/latest).

| Platform                | Release asset                        | Install                                                           |
| ----------------------- | ------------------------------------ | ----------------------------------------------------------------- |
| macOS · Apple Silicon   | `Kova-0.7.0-mac-arm64.dmg` or `.zip` | Open the DMG and drag Kova into Applications, or extract the ZIP. |
| Windows · x64           | `Kova-0.7.0-win-x64.exe`             | Run the installer and choose an installation directory.           |
| Linux · x64             | `Kova-0.7.0-linux-x64.AppImage`      | Make it executable, then launch it.                               |
| Debian / Ubuntu · amd64 | `Kova-0.7.0-linux-x64.deb`           | Install with your package manager.                                |
| VS Code · 1.100+        | `kova-local-0.7.0.vsix`              | Run **Extensions: Install from VSIX…**, then select the file.     |

Desktop packages are currently **unsigned and not notarized**; your OS may show a publisher warning or require explicit approval. Download only from this repository's releases. `SHA256SUMS` accompanies each release so you can check file integrity. Updates are manual. An Intel macOS installer is not included in this release; source builds use the host architecture.

For Linux, from the directory containing the downloaded file:

```sh
chmod +x Kova-0.7.0-linux-x64.AppImage
./Kova-0.7.0-linux-x64.AppImage
# Or, on Debian / Ubuntu:
sudo apt install ./Kova-0.7.0-linux-x64.deb
```

AppImage support depends on your distribution's FUSE setup. The DEB is an alternative on Debian-based systems. Node.js and npm are needed to develop Kova, not to run a desktop installer.

## Quick start

1. Install and start [Ollama](https://ollama.com), then download a model:

   ```sh
   ollama pull qwen3:4b
   ```

2. Open Kova Desktop and choose **Open project**. In VS Code, open a folder and run **Kova: Open Chat**.
3. Follow **Setup** to connect Ollama, load models and select `qwen3:4b`. For a hosted model, choose its provider and supply your API key instead.
4. Start in **Manual** mode. Ask Kova to explain the project, attach relevant files, then review a proposed edit before choosing **Allow once**.

Use **Settings → Provider** on desktop, or **Kova: Set Up AI Provider** in VS Code, to change the connection later. The searchable model chooser shows available capability/context metadata and supports keyboard selection. You can enter a model ID directly when a server has no model-list endpoint.

### Provider compatibility

| Provider mode     | Connection                                                                | Credentials             |
| ----------------- | ------------------------------------------------------------------------- | ----------------------- |
| Ollama            | Native Ollama API; defaults to `http://127.0.0.1:11434` and `qwen3:4b`    | None                    |
| DeepSeek          | Chat Completions with DeepSeek thinking/tool continuation support         | API key                 |
| OpenAI-compatible | Streaming Chat Completions; optional model discovery and function calling | Optional bearer API key |

OpenAI, OpenRouter, Groq, Gemini's compatibility API and LM Studio use the compatible adapter. Presets configure endpoints; they do not guarantee that every model supports tools. Native Anthropic Messages and Azure-specific authentication require a compatible gateway. Generic compatible-provider thinking is disabled because reasoning formats vary. See [provider details](docs/PROVIDERS.md).

### Permissions

| Mode   | Behavior                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------- |
| Plan   | Read-only tools; no edits or commands.                                                            |
| Manual | Reads run automatically; edits and commands require approval.                                     |
| Edit   | Ordinary workspace edits run automatically; commands require approval.                            |
| Auto   | Ordinary edits and exact allowlisted commands run automatically; other commands require approval. |

Protected configuration writes require approval in every mode. Destructive commands recognized by the guardrails are blocked. Approvals apply once to the prepared operation; a file changed after preview requires another preview. **Stop** cancels active work and preserves partial output; it does not undo completed changes or process effects.

## A workspace that fits

![Appearance settings with Serbian Latin, large text, typography icons and light theme selected](https://raw.githubusercontent.com/owlCoder/kova/main/docs/images/appearance-sr.jpg)

Choose language, text size and theme in **Settings → Appearance**. Code, terminal output and conversation content keep their original language. **About Kova** includes shortcuts, privacy information, local-data access, documentation and copyable runtime diagnostics.

| Desktop shortcut           | Action                      |
| -------------------------- | --------------------------- |
| Cmd/Ctrl+K                 | Commands and session search |
| Cmd/Ctrl+F                 | Find in the conversation    |
| Cmd/Ctrl+P                 | Find project files          |
| Cmd/Ctrl+O                 | Open project                |
| Cmd/Ctrl+N                 | New session                 |
| Cmd/Ctrl+,                 | Settings                    |
| Cmd/Ctrl+B                 | Toggle sidebar              |
| Cmd/Ctrl+J                 | Toggle project panel        |
| Cmd/Ctrl+Shift+T or Ctrl+` | Open terminal               |

Desktop sessions persist locally, load on demand and can be renamed or archived. Unsent drafts are stored per desktop session (up to 20 recent drafts) or in VS Code workspace storage; starting a new extension conversation clears its draft. Draft text is local application data, separate from API-key secure storage. Extension history lasts for the current extension session. The desktop terminal is user-operated: hiding it keeps the shell running, closing it terminates the shell, and changing projects closes the old process. Its output is not automatically sent to a model.

The composer’s **Prompt library** offers editable starting points for exploring code, reviewing changes, planning, testing, performance and documentation. Search it to reuse a previous user message from the current conversation, or choose **Reuse prompt** on a message. Inserting text preserves the existing draft and selected mode; review it before sending.

Desktop session row actions let you **Pin**, **Rename** or **Archive** a conversation. Switch to **Archived** to restore it. Archiving preserves its messages, title, pin and retained draft. Each view shows up to 200 sessions for the current project; drafts retain the most recent 20 edited desktop sessions.

## Privacy and trust

- **You select the endpoint.** Kova never silently switches providers. Prompts, selected conversation context, tool definitions and results needed for a task go to the configured provider. Model discovery requests metadata without sending project content.
- **Credentials stay separate.** VS Code uses `SecretStorage`; desktop uses OS encryption with keys scoped to each provider endpoint. If secure storage is unavailable, including Linux `basic_text`, desktop keeps the key in memory for that app session. Keys are not stored in ordinary settings or added to model context.
- **History stays on your device.** Desktop stores settings and sessions in its local data folder. Thinking output is not persisted in conversation history. DeepSeek tool continuations retain required reasoning only in memory.
- **Project access is explicit.** Built-in file tools stay inside the selected workspace. Kova does not background-index your project. Desktop file edits use atomic replacement and stale-version checks; extension edits support VS Code Undo.
- **Use trusted projects.** Approved commands, the interactive terminal, configured hooks and MCP servers run with your user privileges. They are not an OS sandbox. Kova does not add a separate workspace-trust prompt, and model output or command classification can be wrong.

See [desktop storage and security boundaries](docs/DESKTOP.md#local-data-and-keys), [tool policy](docs/TOOLS-AND-POLICY.md) and the [security reporting policy](SECURITY.md).

## Build from source

Use **Node.js 24** and **npm 11**. Git is needed for diff tools; your model server and any project tools run separately.

```sh
git clone https://github.com/owlCoder/kova.git
cd kova
npm ci
npm run check
```

For desktop development:

```sh
npm run desktop:dev
```

For a production desktop build or an installer for your current OS:

```sh
npm run desktop:build
npm run desktop:verify
npm run desktop:start
# Optional: build a native installer
npm run desktop:package
```

For VS Code, press **F5** in this repository to start the extension development host, or package a VSIX:

```sh
npm run package
npm run verify:package
```

Output is written to `dist/installers/` and `dist/kova-local-<version>.vsix`. Linux development requires a compiler toolchain for the native terminal dependency. See [contributing](CONTRIBUTING.md) for setup, checks and smoke tests.

CI runs type checking, linting, formatting and deterministic tests, verifies the VSIX, and builds desktop packages on native macOS, Windows and Linux runners. Native interactive UI and installed-extension smoke checks have been performed on macOS; successful Windows/Linux builds do not imply full manual UI verification. Live cloud-provider checks require your own credentials.

### Project layout

| Directory           | Responsibility                                                    |
| ------------------- | ----------------------------------------------------------------- |
| `packages/core`     | Host-independent agent, context, tools and permission contracts   |
| `packages/runtime`  | Shared Node.js adapters, workspace tools and provider composition |
| `packages/desktop`  | Electron main/preload host, persistence, credentials and terminal |
| `packages/vscode`   | Editor integration and extension host                             |
| `packages/ollama`   | Ollama, DeepSeek and compatible API adapters                      |
| `packages/mcp`      | Local stdio MCP integration                                       |
| `packages/protocol` | Data contracts between the host and interface                     |
| `webview`           | Shared React interface, themes and translations                   |
| `tests`             | Unit, architecture and runtime coverage                           |

## Documentation

- [Setup](docs/SETUP.md) and [desktop guide](docs/DESKTOP.md)
- [Usage, project rules, skills, MCP and hooks](docs/USAGE.md)
- [Provider compatibility](docs/PROVIDERS.md) and [configuration reference](docs/CONFIGURATION.md)
- [Architecture](docs/ARCHITECTURE.md) and [design decisions](docs/adr/README.md)
- [Testing](docs/TESTING.md), [release process](docs/RELEASING.md) and [Marketplace publishing](docs/MARKETPLACE.md)
- [Changelog](CHANGELOG.md)

## Contributing and support

Bug reports, focused pull requests, translations, accessibility improvements and native-platform testing are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Use [GitHub Issues](https://github.com/owlCoder/kova/issues/new/choose) for bugs, feature proposals and usage questions; search existing reports first. Include the app version and OS, and remove secrets and private project content from diagnostics.

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/owlCoder/kova/security/advisories/new), following [SECURITY.md](SECURITY.md). Support is community-based; there is no guaranteed response time.

## License

Kova is available under the [MIT License](LICENSE). Bundled distributions include third-party dependency notices. Model weights, provider services, external tools and their names remain subject to their own licenses and terms.
