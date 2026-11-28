# Configuration reference

The `kova.*` keys below are VS Code settings. API keys are stored separately in VS Code `SecretStorage`.

The default context budget is 200,000 tokens, with 4,096 reserved for output and a 10% safety margin. It is capped automatically to the selected model's reported window, and local Ollama is further capped by `kova.ollama.maxContextTokens` (32,768 by default) because Ollama reserves memory for the whole window. The output reservation never exceeds a quarter of the effective window. The context indicator shows estimated input before generation and measured input/output afterwards. Tool-definition cost remains an estimate. Larger local contexts require more memory; explicit VS Code settings override these defaults.

Run **Kova: Open Settings** to open Kova's own settings dialog in the chat: `kova.ui.language` (`en`, `sr`, `de`), `kova.ui.textSize` (`standard`, `large`, `larger`), `kova.chat.openIn`, the context budget, Ollama options and the Auto command allowlist. Provider endpoints and API keys are managed through **Kova: Set Up AI Provider** and **Kova: Set Provider API Key**; every key below also remains editable in VS Code settings JSON:

| Setting                                | Default                                     |
| -------------------------------------- | ------------------------------------------- |
| `kova.provider`                        | `ollama`                                    |
| `kova.ollama.baseUrl`                  | `http://127.0.0.1:11434`                    |
| `kova.ollama.model`                    | empty until setup or chat picks one         |
| `kova.ollama.think`                    | `false`                                     |
| `kova.ollama.keepAliveSeconds`         | `300`                                       |
| `kova.deepseek.baseUrl`                | `https://api.deepseek.com`                  |
| `kova.deepseek.model`                  | `deepseek-flash`                            |
| `kova.deepseek.think`                  | `false`                                     |
| `kova.openaiCompatible.baseUrl`        | `http://127.0.0.1:8000/v1`                  |
| `kova.openaiCompatible.model`          | empty; use discovered model                 |
| `kova.openaiCompatible.supportsTools`  | `true`                                      |
| `kova.openaiCompatible.name`           | `OpenAI-compatible provider`                |
| `kova.openaiCompatible.discoverModels` | `true`                                      |
| `kova.context.maxTokens`               | `200000` (capped to the model window)       |
| `kova.ollama.maxContextTokens`         | `32768` (local Ollama memory guard)         |
| `kova.chat.openIn`                     | `editor` (or `sidebar`)                     |
| `kova.context.reservedOutputTokens`    | `4096`                                      |
| `kova.context.safetyMarginRatio`       | `0.1`                                       |
| `kova.commands.allow`                  | Exact command list                          |
| `kova.indexing.enabled`                | `false`                                     |
| `kova.indexing.embeddingModel`         | `nomic-embed-text` (empty for keyword-only) |

Generic OpenAI-compatible thinking is disabled because reasoning wire formats are not standardized. Auto allowlisting matches the whole command; chaining, pipes, redirection, substitutions and backticks never match.

Model metadata is cached for 60 seconds; **Retry** and configuration changes refresh it immediately. Ollama metadata loads with at most four concurrent requests. Stream updates are coalesced over 32 ms to reduce Webview messaging and rendering work; completion and approval events flush pending text immediately.

When `kova.indexing.enabled` is true, Kova builds an incremental workspace symbol and snippet index (`mtimeMs`-cached) and refreshes modified files after `write_file` and `edit_file`. If `kova.indexing.embeddingModel` is set (default `nomic-embed-text`, pulled locally via `ollama pull nomic-embed-text`), queries and snippets are embedded through `kova.ollama.baseUrl` for hybrid keyword and cosine-similarity ranking; leaving the setting empty or running without the embedding model falls back to keyword-only search.
