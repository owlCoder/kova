# Provider contract and adapters

Status: **Accepted**.

`LlmProvider.streamChat(ChatRequest, CancellationToken)` is the Core boundary. It streams `TextDelta`, `ThinkingDelta`, complete `ToolCallReady` candidates, localized `MalformedToolCall` diagnostics and one final `Finished` event with normalized usage. Providers never execute tools. Model discovery remains separate from generation.

The shared runtime composes providers for the desktop and VS Code hosts. Each host supplies its own credential store. Core has no HTTP, credential-storage or vendor SDK dependency.

## Supported providers

Kova supports three provider modes:

- **Ollama** is the default, discovers models through `/api/tags` and `/api/show`, and streams Ollama `/api/chat` NDJSON without credentials.
- **DeepSeek** discovers models through the OpenAI-compatible `/models` endpoint and streams `/chat/completions` SSE with DeepSeek's thinking extension. Credentials live in VS Code `SecretStorage`.
- **OpenAI-compatible** uses `/chat/completions` SSE and optional `/models` discovery, and accepts an optional bearer token from `SecretStorage`.

Ollama remains the local-first default (`qwen3:4b`). Selecting an API provider is explicit; Kova never silently sends workspace context to a cloud endpoint.

## Core normalization

Common request data is mapped by each adapter: model ID, role/content history, native function-tool schemas, context/output limits where supported, thinking where the provider defines a wire format, and cancellation.

Common response data is normalized into text deltas, transient thinking deltas, complete tool-call candidates, finish reason and token usage. Provider wire objects never become Core contracts.

## Ollama

Ollama maps `contextWindowTokens` to `options.num_ctx`, `maxOutputTokens` to `options.num_predict`, `thinkingEnabled` to `think` and `keepAliveSeconds` to `keep_alive`. Streaming NDJSON is parsed across arbitrary byte boundaries. Tool calls are emitted only after complete records are received.

Unknown capability metadata stays conservative: unknown or unsupported tools means chat-only behavior.

## DeepSeek

DeepSeek uses the OpenAI-compatible Chat Completions endpoint with the provider-specific `thinking` body field. The default model is `deepseek-flash`.

DeepSeek requires prior assistant `reasoning_content` to be replayed when thinking mode and tools are combined. Kova therefore keeps reasoning in the in-memory provider instance for the active conversation and reattaches it to matching assistant turns. It is not written to the conversation repository, protocol snapshots or workspace files.

Tool-call wire IDs are normalized by Core. On continuation, Kova sends internally consistent assistant tool-call IDs and matching `tool_call_id` values.

## Generic OpenAI-compatible endpoints

Generic endpoints use standard Chat Completions streaming and `/models`. Because reasoning formats are not standardized, generic thinking is disabled. Tool support is explicit through `kova.openaiCompatible.supportsTools`.

The API key is optional so local compatible servers can run without credentials.

**Kova: Set Up AI Provider** supplies endpoint presets for OpenAI, OpenRouter, Groq, Gemini and LM Studio, plus a custom URL. These all use the compatible adapter; they are not separate native API implementations. OpenAI's endpoint uses `max_completion_tokens`; other compatible endpoints retain `max_tokens`. A custom server must support the adapter's Chat Completions streaming fields and optional function calling. Native Anthropic Messages and Azure-specific authentication require a compatible gateway.

Set `kova.openaiCompatible.discoverModels` to `false` and provide a nonempty model ID to work without a model-list endpoint. Manual configuration creates a model entry using the configured tool support; it does not claim a verified network connection or infer context limits. Invalid credentials surface on the first request.

Preset references: [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [OpenRouter](https://openrouter.ai/docs/quickstart), [Groq](https://console.groq.com/docs/overview), [Gemini compatibility](https://ai.google.dev/gemini-api/docs/openai), [LM Studio compatibility](https://lmstudio.ai/docs/developer/openai-compat).

## Credentials

The extension stores API keys through VS Code `SecretStorage`. Desktop uses Electron OS encryption and falls back to in-memory storage if secure encryption is unavailable, including Linux `basic_text`. See [desktop credentials](DESKTOP.md#local-data-and-keys).

Keys are scoped by provider kind and a hash of the endpoint. Legacy provider keys migrate to the current endpoint on first use. A setup draft never includes a saved key in Webview messages or snapshots; native password inputs keep that value inside the extension host.

Commands:

- **Kova: Set Provider API Key**
- **Kova: Clear Provider API Key**

There is intentionally no `kova.*.apiKey` setting, preventing accidental source-control or workspace-settings exposure.

## Failures and cancellation

All adapters honor the shared cancellation token and abort in-flight HTTP. Provider/model failures are recoverable and surface through the existing session error path. Secrets are never included in diagnostic messages.

Model discovery is bounded. Remote model size is represented as unknown (`null`) rather than fabricated.

Successful metadata is cached for 60 seconds using a configuration and credential fingerprint. Retry bypasses the cache; settings changes and credential commands refresh it between runs. Ollama `/api/show` requests use a four-worker pool and preserve `/api/tags` ordering. Failed or cancelled discovery is not cached. Webview delta delivery is batched over 32 ms and also flushed when pending text reaches 4,096 characters, before lifecycle events, and before snapshots.

## Maintainability rules

Runtime TypeScript is kept at or below 500 lines per file. Architecture tests also enforce package boundaries and at most one exported behavioral class/interface per source file. Provider composition, credential storage, transport parsing, attachment management and Webview footer rendering are separated into focused modules.
