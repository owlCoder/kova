# Changelog

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
