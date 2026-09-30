# ADR 007: Host-owned state and a JSON protocol

Status: **Accepted with review changes, 2026-09-30**

## Context

A Webview can reload while streaming or waiting for approval. React state cannot own conversation or security state. Late events from cancelled runs must not affect a new conversation.

## Decision

Core emits `AgentEvent`; the host explicitly maps it to self-contained protocol DTOs, redacting payload summaries and keeping full diff documents in the host. Protocol has no Core imports, even type-only. Version 1 uses request IDs, host-session IDs, sequence numbers, workspace IDs and run IDs. Ready returns an authoritative bounded snapshot. The UI discards stale-session/run events and resynchronizes on a sequence gap.

Host validates every incoming message, rejects unknown types/fields/oversized payloads and stale approval/run IDs, and owns all tool execution and lifecycle state. UI approval is an input to `ApprovalPort`, not a tool executor. Webview cannot contact Ollama, run a command, or provide arbitrary filesystem paths. Content renders as escaped text/Markdown with raw HTML disabled; CSP, local resources and nonces constrain scripts.

## Consequences

The protocol is one-way intents and one-way snapshots/events, with no general RPC or business logic in React. Host event retention is bounded rather than a permanent event store. Thinking is visible only while available in transient UI state and is excluded from reload snapshots/conversation storage. See [protocol details](../PROTOCOL.md).

Reference: [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview).
