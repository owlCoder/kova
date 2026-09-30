# ADR 002: Provider-independent streaming

Status: **Proposed**

## Context

Ollama/Qwen3 is the initial runtime, while future local OpenAI-compatible providers must not change the Agent. Streaming includes text, thinking, tool calls and usage; cancellation must stop IO and approvals without browser/VS Code dependencies in Core.

## Decision

`LlmProvider.streamChat` returns `AsyncIterable<ChatEvent>`. `ModelCatalog` discovers installed models/capabilities independently. Provider adapters assemble chunks into complete tool-call candidates, preserve call IDs and tool-name associations, normalize usage, and signal final finish reasons. Invalid call arguments are repairable; corrupt transport/protocol failures are errors, not invented calls.

Core owns `CancellationToken` and `Disposable`; adapters translate into platform cancellation. Every asynchronous boundary honors cancellation. Models with unsupported or unknown tool capability run chat-only. Thinking defaults off; thinking events never enter conversation history. The Ollama adapter explicitly maps context, output limit, thinking and keep-alive on every request.

## Consequences

The Core has no HTTP types or provider-specific fields. Nonstreaming providers must still honor the same stream contract. Models remain discoverable when chat is unavailable; the host reports a recoverable provider/model problem instead of crashing. A thinking-enabled model can use the same output allowance for reasoning, so a length finish is visible and never interpreted as a completed tool call.

References: [Ollama chat](https://docs.ollama.com/api/chat), [native tool calling](https://docs.ollama.com/capabilities/tool-calling), [model listing](https://docs.ollama.com/api/tags). Provider wire details are verified in its own milestone and fixtures.
