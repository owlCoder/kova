# Changelog

## 1.28.2

- Fix `PinnedContextExceedsBudget` failures on small model windows: the pinned system prompt (instructions + AGENTS.md + skill) is capped at 25% of the context window with a truncation marker, and if tool schemas still do not fit, the run drops tool definitions (recorded as a `Disabled` eviction) and answers without tools instead of failing.
- Show non-provider errors (`AgentFailed`, runtime errors) in the composer error banner immediately instead of only inside a collapsed timeline note.

## 1.28.1

- Fix the transcript going blank right after sending: the host now persists the user message before the started snapshot, and the agent no longer duplicates it, so Enter visibly sends and the conversation never renders empty while a run is busy.
- Remove borders and hard shadow rings from popups and dialogs (mode/model/attach/prompt menus, slash menu, command palette, settings, prompt library, context preview, toast, launcher context menu); high-contrast themes keep their contrast border.

## 1.28.0

- Add prompt placeholders: `{selection}` and `{file}` in a prompt expand from the active editor at submit time.
- Add **Import conversation**: `/import` or the command palette loads an exported conversation Markdown file back as the active conversation.
- Show an estimated cost line in the context meter when `kova.cost.inputPerMillion` / `kova.cost.outputPerMillion` are set.
- Add `kova.testing.command`: when set, the agent runs it once per round through the normal command/approval pipeline after a round that successfully wrote files.
- Add voice input to the composer (Web Speech API): a microphone button appends recognized speech to the draft in sr-RS / de-DE / en-US based on the UI language, and hides itself where the API is missing.
- Add keyboard transcript navigation: ↑/↓ move between messages, E edits the last user message into the composer, R resends it (listed in the launcher shortcuts popover).
- File-change approvals now show a capped side-by-side before/after diff inline (LCS line diff, 200 lines / 12k chars per file, truncation noted); the full diff still opens in the editor.
- Every run automatically creates a `git stash create` checkpoint; **Revert run changes** keeps precise per-file restore and falls back to `git stash apply` when needed. The revert bar shows when a checkpoint exists.
- Multi-root workspaces get a folder picker in the chat header (`SetWorkspaceRoot`), applied through the existing queued root-switching path.
- Add the **Kova: Inline Edit Selection** command (editor context menu, command palette): attaches the selection, prefills the composer and opens the chat.
- Add read-only `web_search` (DuckDuckGo HTML, no API key) and `web_fetch` (http(s) only, 200 KB cap, HTML-to-text) tools.

## 1.27.0

- Work in the opened workspace folder like a CLI harness: the agent knows the workspace root and follows folder changes live (adding/removing folders rebuilds the tool runtime after the current run). With no folder open the welcome screen says file tools are disabled.
- Add the `apply_patch` tool: multi-file unified diffs with strict hunk matching, bounded size, and the usual path containment, protected-path and approval pipeline.
- Add the `update_todos` tool and a live plan checklist in the transcript (Plan header, per-step status) for multi-step runs.
- Type `@` in the composer to mention workspace files (debounced search, inserts `@path` and attaches the file).
- Add `/init`: scans the workspace and writes or updates `AGENTS.md` through the normal tool/approval flow.
- Chat history rows can be renamed (right-click → Rename) and filtered with a search box in the launcher.
- Add a **Revert run changes** action after a run that touched files: modal confirmation, then `git checkout` for tracked files and deletion of files the run created.
- Stream `run_command` output live into the tool row while the command runs.
- Paste or drop images into the composer to attach them for vision-capable models (Ollama `vision` capability, `kova.openaiCompatible.supportsVision`); shown as a chip and rendered in the preview dialog.
- Show cumulative token usage (input/output/runs) for the conversation in the context meter popover.

## 1.26.11

- Open Kova as an editor tab beside the current file by default, like other agent tabs, so the Explorer stays free. **Kova: Open Chat** (Cmd+Alt+K / Ctrl+Alt+K) and a Kova button in the editor title bar open it; `kova.chat.openIn` switches back to the Activity Bar sidebar, or run **Kova: Open Chat in Sidebar**, which switches that setting.
- The Activity Bar icon now shows a small launcher (connection, actions, shortcuts) and opens the conversation as an editor tab. The editor tab uses a centered layout: title in the middle, a minimal empty state, a narrow reading column and a framed composer with a model chip and accent send button.
- Open the prompt library as a quick menu above the composer (saved prompts, templates, recent messages, search); the full editor stays under **Manage…**.
- Show provider connection problems as a banner above the composer, as wide as the input, with Retry and Set up provider instead of a raw error code.
- Add **Add to Kova Context** to the Explorer and editor tab context menus for the selected files.
- Raise the default context budget to 200,000 tokens. It is capped to the selected model's reported window instead of refusing to run, and the output reservation stays within a quarter of that window. Local Ollama keeps a 32,768-token cap (`kova.ollama.maxContextTokens`) because Ollama reserves memory for the full window.
- Translate the transcript's lifecycle notes (project rules, hooks, MCP servers, guardrails, skill loads, interruptions, token-limit and stop reasons) into Serbian Latin and German with the rest of the interface.
- Polish the chat surfaces: light and high-contrast themes now cover the transcript, menus, banner and launcher; the mode, prompt, model, context and attach menus float above the composer instead of over its text; and the composer bar fits a narrow sidebar with an icon-only mode toggle and a truncated model name.
- Hide the header title until the first prompt names the conversation; only the Kova mark shows in the empty state.
- Make every composer menu a native auto popover: clicking empty space or pressing Esc closes it, and opening one closes the others, so at most one menu is open at a time.
- Add a Kova-styled settings dialog (header gear, Cmd/Ctrl+,, command palette, launcher action) covering interface language, text size, chat placement, context budget, Ollama options and the Auto-mode command allowlist, instead of the generic VS Code settings editor. Values are validated against a host-side allowlist before they are written to the global configuration.
- Remove the Kova mark from the chat header (the editor tab and view already carry the icon) and center a larger mark on the empty page.
- Do not preselect a default Ollama model: `kova.ollama.model` starts empty and is filled when you choose a model in setup or the chat; the model picker shows "Choose model" until then.
- Add slash commands in the composer: typing `/` opens a menu with `/clear`, `/compact` (folds older messages into a bounded summary via the existing compactor, keeping the last messages visible), `/export`, `/copy`, `/model`, `/mode`, `/context`, `/prompts`, `/settings` and `/help`; arrow keys and Enter run a command, Esc dismisses the menu.
- Highlight generated code blocks locally with theme-aware colors for dark, light and high-contrast: C#, TS/JS, Python, Bash, SQL, JSON, YAML, XML/HTML, diff, plus Rust, Go, Java, Kotlin, Swift, C, C++, PHP, Ruby, Lua, R, Scala, Dart and CSS (preprocessor lines, `$variables`, `:symbols`, at-rules and hex colors included). Tokens are rendered as React text spans, so the webview CSP is untouched and no remote highlighter is loaded. Code blocks get a restyled toolbar (uppercase language tag, hover copy button), softer border, subtle shadow and tighter code padding.
- Persist conversations in workspace storage and list them in the Activity Bar launcher under **Conversations** (newest first, titled by the first prompt, active one highlighted); clicking a row reopens that conversation in the chat. Storage is bounded to 50 conversations, 200 messages each and 3 MB total, dropping the oldest first.

## 0.10.0

- Kova is now a VS Code extension only. Remove the Electron desktop app, its installers, integrated terminal, session browser, file inspector, desktop preferences, protocol messages, scripts and workflow. Releases contain the VSIX and checksums.
- Redesign the panel as an agent transcript that follows VS Code's theme, fonts and colors. Tool calls appear inline at the point where Kova acted, one line each with a status dot, arguments and a folded result; rules, hooks, MCP, guardrails, interruptions and errors appear as short notes.
- Ask for permission inline: open the diff or read the exact command, then press 1 to allow once, 2 or Esc to reject.
- Show an animated working line with elapsed time while a task runs; Esc interrupts it from anywhere in the panel.
- Replace the composer with one rounded input: permission mode toggle (Shift+Tab cycles Ask before changes, Accept edits, Auto mode and Plan mode), context attachments, prompt library, model picker, context ring and send/stop.
- Use the first prompt as the conversation title in a compact view toolbar.
- Remove about 35 KB of unused desktop styles and the Electron, electron-builder and xterm dependencies.

## 0.9.0

- Add a personal prompt library in desktop and VS Code with searchable Saved, Templates and Recent collections. Create and edit reusable prompts, save drafts or user messages, adapt templates, and undo the latest removal while the library is open.
- Retain up to 40 prompts with exact text, bounded titles/content and host-owned persistence. Desktop libraries span local projects; extension libraries remain scoped to a workspace and shared by its sidebar and chat tab.
- Serialize library writes, retain the editor’s opening revision across updates from other views, offer saving conflicted drafts as new copies, reject stale revisions, keep failed writes out of memory, and preserve damaged storage. Saved library text stays outside routine snapshots and model context until explicitly inserted and submitted.
- Load library code, styles and recent-message indexing only when opened. Cache normalized search text and defer filtering so typing remains responsive. Remove the old always-mounted prompt list.
- Add host-confirmed clipboard feedback for messages, code, context previews and diagnostics, plus a clear selection-copy hint for oversized content. Clipboard listeners exist only while a copy is pending.
- Extend Kova's visual language into the library, with compact icon navigation, themed surfaces, large-text support, keyboard focus and English, Serbian Latin and German copy.
- Expand regression and installed-VSIX smoke coverage for library persistence, concurrent edits, context isolation and clipboard acknowledgments, wait for PowerShell readiness in Windows terminal fixtures, and document storage and resource boundaries.

## 0.8.0

- Preview captured context in desktop and VS Code through an explicit, conversation-scoped request. Show source and character count, render plain text safely, and cap the preview at 50,000 characters without changing the attachment.
- Separate attachment preview and removal controls, refresh reattached files in place, retain distinct selections and commit multi-file capture atomically. Refuse stale picker results and use bounded file reads in both hosts.
- Clear attached context when starting a new extension conversation, matching desktop behavior. Keep previews available during generation while context removal stays locked.
- Render the latest 40 messages when opening a long conversation, load 40 earlier messages at a time while retaining the reading position, and offer a return to recent messages. Find loads all saved messages in the current snapshot and preserves search results after closing.
- Share bounded streaming-message projection between hosts, report the actual configured text-read limit, and preserve focus across preview/settings transitions.
- Extend Kova branding into context review and About, with coherent dark/light surfaces, text scaling and English, Serbian Latin and German controls.
- Add a release-preparation workflow that validates successful main-branch builds at an exact commit, transfers artifacts directly within GitHub, generates checksums and verifies uploaded digests. Publishing remains a separate action; published releases are never overwritten.
- Expand regression coverage and installed-VSIX smoke checks, add a deterministic long-history desktop fixture, and document context review and release preparation.

## 0.7.0

- Organize desktop conversations with persistent pins, accessible row menus, archive browsing and restore. Archiving preserves history, title, pin and retained draft.
- Scope session lists to the current project before applying the 200-session view limit, and cache sorted metadata until it changes.
- Defer desktop sidebar and inspector code so the extension loads only the shared interface. Keep late draft flushes valid after archiving or changing projects.
- Add a searchable prompt library in desktop and VS Code: six localized templates and up to 12 recent distinct user messages from the open conversation.
- Reuse a user message directly from its message actions. Insert text at the composer caret, preserve the existing draft and selected mode, and refuse overflow without truncating text.
- Share welcome-screen templates with the composer, translate their prompt text into Serbian Latin and German, and disable composition until the initial host snapshot arrives.
- Keep keyboard navigation, Escape dismissal, focus restoration, compact radii and light/dark surfaces consistent across session and prompt controls.
- Cover session migration, archive/restart/index recovery, project-scoped limits, intent validation, prompt insertion and translation with regression tests.

## 0.6.0

- Add conversation search in desktop and VS Code with Cmd/Ctrl+F, literal matching across Markdown/code, highlighted results and Enter/Shift+Enter navigation.
- Export or copy the current conversation as Markdown from the header or command palette. Native save dialogs choose the destination; internal tool payloads, repair messages and reasoning are excluded.
- Preserve unsent drafts per desktop session and in VS Code workspace storage, restore them after restart, and recover rejected submissions without replacing a newer draft.
- Debounce draft writes, cap retained desktop drafts, and clear only the draft actually consumed by a successful submission.
- Isolate completed message rendering during streaming, defer desktop preferences loading, and reduce the initial shared JavaScript bundle despite adding the new controls.
- Unify the Kova mark and tagline across host headers, messages, welcome and About; refine compact header actions and use platform-correct shortcut hints.
- Translate new controls into Serbian Latin and German, preserve search position as content updates, and keep terminal shortcuts separate from conversation search.
- Expand native VSIX smoke checks with draft/export behavior and support a configurable local test provider.

## 0.5.2

- Fix mixed light/dark desktop surfaces by scoping VS Code fallback colors exclusively to the extension host; add a regression check for that boundary.
- Reduce control, tab and panel radii; add typography icons and selected-state checks to text-size choices.
- Replace browser checkbox styling with accessible, theme-aware checkmarks and clearer settings rows.
- Add a searchable model chooser with keyboard navigation, capability/context details, bounded results and native light-dismiss behavior. Provider settings retain direct manual model-ID entry.
- Close dialogs consistently with Escape after clicking their content, restore opener focus and keep nested model-picker dismissal separate.
- Publish native installers and the VSIX with checksums, and expand open-source documentation with screenshots, contribution guidance, private security reporting and issue templates.

## 0.5.1

- Refine the workspace with a graphite/copper dark palette, clearer surface layers, readable secondary text and shared terminal/native chrome colors.
- Replace generic starter cards with numbered actions, add real theme previews and unify control radii, focus rings, selection accents and dialog motion.
- Grow the composer with its content, keep manual conversation scrolling stable and provide a shortcut back to the latest messages.
- Keep dialog keyboard focus contained and restore its opener; wrap command navigation, skip unavailable actions and scroll the selected result into view.
- Respect reduced-motion preferences and check text/control contrast in both standalone palettes.

## 0.5.0

- Increase interface typography and add persistent Comfortable, Large and Extra large text sizes.
- Add Serbian Latin, English and German interface languages, including desktop menus; preserve code and conversation content as written.
- Expand About Kova with privacy/local-data details, keyboard shortcuts, documentation, issue/license links and safe copyable runtime diagnostics.
- Refine the native title bar with project commands, terminal access, focus/maximize state and theme-aware window controls.
- Add an interactive project terminal using xterm.js and native PTYs: login shell/PowerShell, resize, Ctrl+C, clear, restart, hide and close.
- Keep terminal processes separate from AI tool permissions, close them on project changes/exit, and bound output with backpressure and lazy UI loading.
- Package the platform-specific N-API terminal binaries without Electron rebuilds and add real-shell, localization and IPC validation tests.

## 0.4.0

- Add a cross-platform Electron desktop app with project switching, persistent sessions, session rename/archive and automatic history restoration.
- Modernize the shared desktop/VS Code interface with streaming Markdown, tables and copyable code blocks, command palette, searchable model selection and clearer permission/context controls.
- Add a project file browser, bounded filename search, file previews, context attachments, activity inspection and proposed/working-tree diff review in desktop.
- Add native provider preferences with cloud/local presets, secure OS key encryption and memory-only fallback, plus dark/light/system appearance.
- Extract shared Node tools, providers and workspace runtime into `@kova/runtime`; keep VS Code editor adapters and Electron composition independent.
- Load desktop history lazily with an eight-session cache, persist interrupted response status, and bound file lookup without background indexing.
- Add native packaging for macOS, Windows and Linux, a build matrix, isolated desktop smoke tooling and tests for storage, cancellation, key handling, approvals and file safety.
- Update runtime/UI/tooling dependencies and remove all reported npm audit vulnerabilities.

- Add a first-run setup guide with provider configuration, model selection and permission-mode help, available again from the chat header.
- Add **Kova: Set Up AI Provider** with local/cloud presets, custom compatible endpoints, secure key input, connection checks and a final configuration review.
- Support manual model IDs for compatible APIs without `/models`, plus configurable provider display names and tool support.
- Scope credentials to each endpoint and migrate older stored keys on first use.
- Cache successful model metadata for 60 seconds, load Ollama metadata with four workers, and batch Webview stream updates over 32 ms.
- Refresh provider settings between runs and avoid reparsing unchanged message content.

## 0.3.2

- Load project rules from the workspace root `AGENTS.md` into every run, ahead of the selected skill, and show them in the activity list.

## 0.3.1

- Increase default context to 32,768 tokens and output reserve to 4,096, keeping the 10% safety margin.
- Document collapsed thinking display, workspace skills, stdio MCP configuration and permission modes.

## 0.3.0

- Add multi-provider model support while keeping Ollama as the local-first default.
- Add DeepSeek streaming, model discovery, tool calls, usage reporting and provider-specific thinking support.
- Add generic OpenAI-compatible `/models` and Chat Completions support for hosted or local endpoints.
- Store API credentials only in VS Code `SecretStorage`, with commands to set and clear the selected provider key.
- Preserve DeepSeek `reasoning_content` only as transient in-memory state when a thinking + tool-call continuation requires it.
- Separate provider composition, API transport, context attachment handling and Webview footer rendering into focused modules.
- Enforce a 500-line runtime TypeScript/TSX source limit and retain the one-public-behavior-per-file architecture check.
- Update README, setup and Marketplace copy for local and API-provider workflows.
- Keep Marketplace publication manual through the publisher portal.
- Bump the Marketplace extension package to `0.3.0` and refresh provider-focused metadata and keywords.

## 0.2.0

- Use the Marketplace package name `kova-local`; retain Kova as the displayed product name.
- Redesign the sidebar with readable model/mode controls, a larger composer and compact activity rows.
- Keep the sidebar as the default chat view and add **Kova: Open Chat in Editor** for a movable editor tab.
- Share session conversation between the sidebar and editor tab; reuse the existing tab when opening it again.
- Stop active work when closing the editor tab; keep runs active when hiding the sidebar.
- Attach code from the most recently active file editor while chat has focus.
- Preserve the selected model and mode when attaching context before a run.
- Replace the color and monochrome logos.
- Render the Activity Bar logo through a monochrome SVG mask that follows the active theme.
- Derive VSIX filenames from the extension version and clean the extension build before packaging.
- Update setup, release documentation and public repository copy.

## 0.1.0

- Local Ollama model discovery and streamed chat, with cancellation and optional thinking.
- Explicit context window, input/output usage and bounded conversation history.
- Plan, Manual, Edit and Auto permission modes.
- Workspace read, list, search, Git diff, create, exact edit and command tools.
- Diff previews, single-use approvals, protected paths and stale-write detection.
- Explicit skills, stdio MCP tools, command hooks and project guardrails.
- Configuration reload between runs and process cleanup on cancellation/disposal.
