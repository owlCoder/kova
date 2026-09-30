# ADR 001: Inward dependencies

Status: **Proposed**

## Context

Kova is both a usable extension and an example of Clean Architecture. Platform, provider and presentation code must not leak into agent orchestration. The host and Webview need a shared protocol without importing each other's runtime.

## Decision

Use npm workspaces with `@kova/core`, `@kova/ollama`, `@kova/mcp`, `@kova/vscode`, `@kova/protocol` and `@kova/webview`. Core has zero external dependencies and no Node or DOM ambient types. Infrastructure imports Core. VS Code composes implementations. Protocol contains only JSON DTOs and type-only Core data imports. Webview depends on Protocol, React and Vite, without VS Code/Node/provider imports.

One public class or behavioral interface per file; implementation and interface separate. Group only cohesive DTOs. No dependency-injection framework, cross-package event bus or generic services package. Public barrel files may re-export; do not hide boundary violations behind them.

## Consequences

Architecture tests inspect static imports, re-exports, import types, dynamic imports, `require` and package dependency declarations. Core compiles separately with an ES-only library. Protocol adds one small package to the proposed tree, with a concrete purpose. IO adapters remain in VS Code rather than creating another package prematurely.

TypeScript 6.0.3 is selected for this scaffold because the chosen typescript-eslint release supports versions below 6.1; using the newer TypeScript release would exceed that tool's declared compatibility. Revisit compiler/tool versions together.
