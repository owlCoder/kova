# Changelog

## 0.2.0

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
