# Kova Desktop

Kova Desktop is the standalone Electron host for the same agent runtime and React chat used in the VS Code extension. Native packaging runs on macOS, Windows and Linux; local desktop interaction is verified on macOS.

## Start from source

Use Node 24 and npm 11:

```sh
npm ci
npm run check
npm run desktop:build
npm run desktop:verify
npm run desktop:start
```

For development, run `npm run desktop:dev`. Vite updates the renderer immediately; main and preload changes restart Electron. The development server binds only to `127.0.0.1:5175`.

## Set up a project and provider

1. Choose **Open project** to select a local directory.
2. Follow **Setup → Configure provider**, or open **Settings → Provider**.
3. Choose Ollama, DeepSeek, OpenAI, OpenRouter, Groq, Gemini, LM Studio or a custom compatible endpoint.
4. Confirm the endpoint and enter the API key if required. **Remember key** uses OS encryption. Disable it for a key that lasts only until quitting.
5. Choose **Load models** or enter a chat model ID manually. Manual IDs work with servers without `/models`; chat compatibility is checked on the first prompt.
6. Set tool support and thinking to match the model, then save the connection.
7. Choose **Manual** mode to review edits and commands before applying them.

Ollama defaults to `http://127.0.0.1:11434`, model `qwen3:4b`. Install it with `ollama pull qwen3:4b`. Compatible endpoints must implement streaming Chat Completions. Native Anthropic Messages and Azure-specific authentication need a compatible gateway.

**Load models** requests metadata only. Prompts, attached context and tool results go only to the selected endpoint when running a task. Kova never switches providers automatically.

## Workspace controls

The sidebar lists projects and sessions. Reopening a project resumes its latest session. Rename or archive a session from its row actions. New sessions keep earlier history. The right panel contains:

- **Files:** directory browsing, filename/path search, bounded text preview and context attachments. Search skips dependencies and symlinks; use a specific path if the bounded search reaches its limit.
- **Changes:** actual proposed before/after content during approval, or the working-tree Git diff.
- **Activity:** tool calls, project rules, permissions and results.

Markdown supports lists, tables and fenced code. Code blocks and messages have copy controls. External images do not load automatically. HTTP(S) links open through the operating system.

**Stop** cancels generation, an approval wait or a process. The partial response is saved, and applied edits remain. Desktop writes are atomic and check the previewed file version. Use Git to restore desktop edits; VS Code Undo is available in the extension.

| Shortcut   | Action                      |
| ---------- | --------------------------- |
| Cmd/Ctrl+K | Commands and session search |
| Cmd/Ctrl+P | Search project files        |
| Cmd/Ctrl+O | Open project                |
| Cmd/Ctrl+N | New session                 |
| Cmd/Ctrl+, | Settings                    |
| Cmd/Ctrl+B | Toggle sidebar              |
| Cmd/Ctrl+J | Toggle project panel        |

**Settings → Appearance** supports dark/light/system themes, three readable text sizes and English, Serbian Latin and German. Changes apply immediately and persist after restart. Code, terminal output and conversation content are not automatically translated. **About Kova** includes privacy information, shortcut help, source/docs/issue/license links, a local data-folder action and copyable version diagnostics without keys, conversations or project paths.

The graphite/copper dark palette is shared by the interface, terminal and native window controls. Theme tiles preview the actual layout. Dialogs return keyboard focus to their opener; the command palette wraps through available actions and keeps the active result visible. The composer grows with your draft. Reading older messages pauses automatic following; **Latest messages** returns to the end. Motion respects the operating system's reduced-motion preference.

The model chooser searches IDs and display names and shows discovered tool/context support. Use Up/Down and Enter to choose, or Escape to close. The provider model field also accepts a manual ID directly. Large catalogs show at most 80 matches; refine the query to find other models. Model choice controls do not request a model or send project content.

## Interactive terminal

Use **Cmd/Ctrl+Shift+T**, **Ctrl+`**, the command palette or the title-bar terminal button. The panel starts your login shell on macOS/Linux and PowerShell on Windows in the current project. It supports interactive CLI applications, ANSI colors, Ctrl+C, clear, restart and drag/keyboard resizing. Hide preserves the process; Close terminates it. Changing projects or quitting closes the current shell.

The terminal is operated by you and is independent of the AI tool approval pipeline. Commands have your user permissions and can change directories or access files outside the project. Terminal output is not automatically added to AI context or conversation history. Display scrollback and host replay buffers are bounded, and acknowledgment-based backpressure prevents fast command output from flooding the renderer.

Project `AGENTS.md`, `.kova/skills`, `.kova/mcp.json` and `.kova/hooks.json` work in both hosts. Use trusted projects: hooks, MCP and approved commands run with your user privileges.

## Local data and keys

Data lives in the platform's Electron user-data directory for `kova-desktop` (typically `~/Library/Application Support/kova-desktop` on macOS, `%APPDATA%/kova-desktop` on Windows and `~/.config/kova-desktop` on Linux). `settings.json` contains preferences, `session-index.json` contains metadata, and `sessions/<uuid>.json` contains history. Sessions load lazily; archiving hides a row and keeps its file. Back up this directory to retain history.

`credentials.json` contains encrypted API keys scoped to provider type and endpoint. Electron safeStorage uses the OS credential system. If encryption is unavailable, including Linux `basic_text`, Kova keeps the key only in memory and displays a notice. No plaintext key is saved in ordinary settings or sent to the renderer. Removing a key removes it for that endpoint.

The renderer is sandboxed and context-isolated, with Node integration disabled. Provider requests and filesystem actions run in main through validated IPC. This does not sandbox project commands or MCP servers.

## Build installers

```sh
npm run desktop:package
```

Installers appear in `dist/installers`: DMG/ZIP on macOS, NSIS EXE on Windows, AppImage/DEB on Linux. The **Desktop builds** GitHub workflow builds and uploads all three platforms using native runners. Builds are unsigned until signing/notarization credentials are configured. Installers are not automatically published to a release or app store.

The terminal uses node-pty's N-API runtime: published binaries on macOS/Windows and the local `npm ci` native build on Linux. Packaging stages the host's binary outside ASAR. `desktop:verify` starts a shell through the staged module and checks its output before an installer is produced.

## Native smoke check

After `desktop:build`, run `npm run desktop:smoke`. It starts a disposable project, isolated profile and local synthetic Ollama server. Send a prompt, ask **Update note.txt**, inspect and approve the diff, test a long answer with Stop, test settings and appearance, then quit. `node scripts/desktop/smoke.mjs --interface-only` instead verifies that a UI-run terminal command writes `terminal-smoke.txt` containing `KOVA_TERMINAL_OK` and that Serbian/large text preferences persist. The fixture can target a packaged app with `--app=/absolute/path/to/executable`. The script verifies the approved edit and saved history and removes temporary data. It does not contact an external AI service.
