# ADR 011: Remove the desktop host; VS Code only

Status: accepted, 2026-11-25. Supersedes the desktop parts of [ADR 010](010-desktop-runtime.md).

## Context

Kova shipped two hosts: the VS Code extension and an Electron desktop app with its own sessions, file browser, terminal, preferences and installers. The desktop host carried native dependencies (a PTY), per-OS builds, unsigned installers and a second validation boundary, while the product is used inside the editor.

## Decision

Kova is a VS Code extension only. Remove `@kova/desktop`, its scripts, workflow, installers, protocol intents and resources, and the desktop-only webview components. Keep `@kova/runtime` as the Node adapter layer, which keeps Core host-independent and the boundary tests meaningful.

The panel is designed for the editor: it inherits VS Code theme variables and fonts, shows tool calls inline in the transcript at the point where the agent acted, asks for permission inline with keyboard answers (1, 2, Esc), cycles permission modes with Shift+Tab and interrupts with Esc.

## Consequences

- Releases contain one VSIX plus checksums; the release workflow needs only the checks run.
- Session organization (pins, archives, persistent desktop history), the integrated terminal and the project file browser are gone; VS Code provides editors, terminals and explorers.
- Protocol messages are fewer, so the host validation surface is smaller.
