# Configuration reference

Desktop preferences are available in **Settings → Provider** and **Settings → Appearance**. The `kova.*` keys below are VS Code settings, not desktop configuration keys. See [Desktop local data](DESKTOP.md#local-data-and-keys) for desktop storage and credentials.

The default context budget is 32,768 tokens, with 4,096 reserved for output and a 10% safety margin. The context indicator shows estimated input before generation and measured input/output afterwards. Tool-definition cost remains an estimate. Larger local contexts require more memory; explicit VS Code settings override these defaults.

Run **Kova: Open Settings** to change provider settings, `kova.ui.language` (`en`, `sr`, `de`) and `kova.ui.textSize` (`standard`, `large`, `larger`):

| Setting                                | Default                      |
| -------------------------------------- | ---------------------------- |
| `kova.provider`                        | `ollama`                     |
| `kova.ollama.baseUrl`                  | `http://127.0.0.1:11434`     |
| `kova.ollama.model`                    | `qwen3:4b`                   |
| `kova.ollama.think`                    | `false`                      |
| `kova.ollama.keepAliveSeconds`         | `300`                        |
| `kova.deepseek.baseUrl`                | `https://api.deepseek.com`   |
| `kova.deepseek.model`                  | `deepseek-flash`             |
| `kova.deepseek.think`                  | `false`                      |
| `kova.openaiCompatible.baseUrl`        | `http://127.0.0.1:8000/v1`   |
| `kova.openaiCompatible.model`          | empty; use discovered model  |
| `kova.openaiCompatible.supportsTools`  | `true`                       |
| `kova.openaiCompatible.name`           | `OpenAI-compatible provider` |
| `kova.openaiCompatible.discoverModels` | `true`                       |
| `kova.context.maxTokens`               | `32768`                      |
| `kova.context.reservedOutputTokens`    | `4096`                       |
| `kova.context.safetyMarginRatio`       | `0.1`                        |
| `kova.commands.allow`                  | Exact command list           |

Generic OpenAI-compatible thinking is disabled because reasoning wire formats are not standardized. Auto allowlisting matches the whole command; chaining, pipes, redirection, substitutions and backticks never match.

Model metadata is cached for 60 seconds; **Retry** and configuration changes refresh it immediately. Ollama metadata loads with at most four concurrent requests. Stream updates are coalesced over 32 ms to reduce Webview messaging and rendering work; completion and approval events flush pending text immediately.
