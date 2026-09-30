# Provider contract and Ollama mapping

Status: **Accepted**. Milestone 1 implements chat streaming and model discovery; native tool mapping remains milestone 2.

`LlmProvider.streamChat(ChatRequest, CancellationToken)` streams TextDelta, ThinkingDelta, complete ToolCallReady candidates, localized MalformedToolCall diagnostics, a final Finished event carrying provider usage. It never executes a tool. Model discovery is a separate `ModelCatalog` port. Core neither fetches nor parses Ollama JSON.

## Mapping

| Core field/event            | Ollama wire mapping                                                        |
| --------------------------- | -------------------------------------------------------------------------- |
| modelId                     | `model`                                                                    |
| messages                    | Role/content; assistant `tool_calls`; tool `tool_name`                     |
| tools                       | Native `{ type: "function", function: { name, description, parameters } }` |
| contextWindowTokens         | `options.num_ctx`, always explicit                                         |
| maxOutputTokens             | `options.num_predict`, always explicit                                     |
| thinkingEnabled             | `think`, default false                                                     |
| keepAliveSeconds            | Explicit `keep_alive`, default `"5m"`/equivalent duration                  |
| streaming                   | `stream: true`                                                             |
| TextDelta                   | `message.content` chunks                                                   |
| ThinkingDelta               | `message.thinking` chunks, never historical messages                       |
| Finished.usage.inputTokens  | Final `prompt_eval_count`                                                  |
| Finished.usage.outputTokens | Final `eval_count`                                                         |
| Finished                    | Final `done` / finish reason normalized into Complete, ToolCalls or Length |

Risk/origin metadata is not sent as model tool schema. Provider assigns deterministic local call IDs when the wire format lacks them, retaining the same identity across complete fragments. Preserve valid assistant calls and matching tool-name results on continuation. Parse NDJSON across arbitrary byte boundaries, including split UTF-8, multiple lines/chunk and final no-newline records. Bound buffered records; transport/protocol errors are recoverable ErrorOccurred outcomes. Never execute a partially assembled call because generation was cancelled or length-limited.

Default endpoint: `http://127.0.0.1:11434`. Settings: `kova.provider` (only ollama in v1), `kova.ollama.baseUrl`, `.model` (`qwen3:4b`), `.think` (false), `.keepAliveSeconds` (`300`), `kova.context.maxTokens` (8192), `.reservedOutputTokens` (1024), `.safetyMarginRatio` (0.10), `kova.commands.allow`. Endpoint changes are explicit user configuration; no source is sent to cloud services by default.

## Discovery and failures

Use `GET /api/tags` for installed models. Inspect available capability metadata, including `POST /api/show` when needed, before exposing tools. Unsupported/unknown tool capability means visible chat-only behavior; do not guess from a model name. Thinking support is checked before enabling it. Validate selected model existence and reported context capability where available. Unknown max context is reported as unknown, not a fabricated guarantee.

Unavailable endpoint → visible Ollama unavailable with Retry and bundled setup instructions. Missing selected model → installed-model picker/setup guidance. No model download in v1. Failed discovery of one model's capability does not erase other installed models; that model stays conservative/unknown.

Mock HTTP/NDJSON tests cover mapped fields, tool/result continuation, usage, interrupted chunks, malformed arguments, timeout/abort, missing model and unavailable runtime. Real local smoke tests verify streaming and stop with qwen3:4b but do not become network-dependent CI tests.

Reference mapping is based on [Ollama chat](https://docs.ollama.com/api/chat), [native tool calling](https://docs.ollama.com/capabilities/tool-calling), [model listing](https://docs.ollama.com/api/tags) and [official API source for show](https://github.com/ollama/ollama/blob/main/docs/api.md#show-model-information). Reverify exact wire fixtures during implementation; SDK/wire objects never become Core contracts.
