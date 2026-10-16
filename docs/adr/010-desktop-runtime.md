# ADR 010: Shared runtime and Electron desktop host

Status: accepted, 2026-10-16.

The standalone desktop app needs the extension's agent, providers, tools, project rules, hooks and approval semantics. Keeping those adapters under the VS Code package would couple Electron to editor APIs and duplicate behavior.

Extract pure Node implementations into `@kova/runtime`. Both hosts compose Core and Runtime and map into data-only Protocol DTOs. VS Code injects its editor-aware reader/writer so unsaved documents and undo remain supported. Electron uses the Node reader and atomic version-checked writer. Core retains no Node, DOM, Electron or VS Code imports.

Use Electron to reuse React presentation with native project dialogs, keyboard menus and OS key encryption across macOS, Windows and Linux. Main owns filesystem, process and provider access. The isolated sandboxed renderer uses a minimal frozen preload bridge; validate JSON messages and restrict IPC to the trusted main frame. Deny renderer navigation, new windows, permissions and production network connections.

Persist sessions and preferences locally with serialized atomic JSON writes. Use a metadata index and an eight-body LRU to keep startup independent of total history size. Encrypt endpoint-scoped keys with OS-backed safeStorage; unavailable or plaintext fallback stores mean memory-only keys. Retain archived files for recovery.

Build native installers on native CI runners. Local unsigned artifacts support development and review; signing, notarization and public distribution remain explicit release work. Extend architectural checks to Runtime and Desktop and test persistence, encrypted-key fallback, approvals, atomic writes, file search and cancellation.
