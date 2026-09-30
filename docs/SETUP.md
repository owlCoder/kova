# Kova setup

Kova is local-first. The default provider is Ollama with Qwen3 4B:

```sh
ollama pull qwen3:4b
```

Install Kova from its VSIX with **Extensions: Install from VSIX**. Run **Kova: Open Chat** or select Kova in the Activity Bar to open the sidebar. Use **Kova: Open Chat in Editor** for a movable editor tab. Both views share the session conversation. **Stop** cancels the active run and **New conversation** clears the current chat.

## Providers

Open **Kova: Open Settings** and choose `kova.provider`.

### Ollama

`ollama` remains the default. The default endpoint is `http://127.0.0.1:11434` and the default model is `qwen3:4b`. Installed models are discovered from Ollama. Models without confirmed tool support run chat only.

### DeepSeek

Choose `deepseek`, then run **Kova: Set Provider API Key**. The key is stored with VS Code `SecretStorage`; it is never written to `settings.json`.

The default endpoint is `https://api.deepseek.com` and the default model is `deepseek-flash`. Model discovery uses the provider `/models` endpoint. `kova.deepseek.think` controls thinking mode.

When DeepSeek thinking and tools are both enabled, Kova keeps provider-required `reasoning_content` only in the in-memory provider session and replays it for tool turns. It is not persisted in Kova conversation history.

### OpenAI-compatible endpoints

Choose `openaiCompatible` for an endpoint that implements OpenAI Chat Completions plus `/models`. Configure:

- `kova.openaiCompatible.baseUrl`
- `kova.openaiCompatible.model` (optional; the first discovered model is used when empty)
- `kova.openaiCompatible.supportsTools`

Run **Kova: Set Provider API Key** if the endpoint requires bearer authentication. Leaving the key unset supports local compatible deployments. Generic OpenAI-compatible thinking is disabled because reasoning wire formats are provider-specific.

Use **Kova: Clear Provider API Key** to remove the stored key for the selected API provider.

Selecting DeepSeek or an OpenAI-compatible endpoint sends the prompt and context needed for the active request to that configured endpoint. Kova never silently switches away from the selected provider.

## Working with Kova

Use **Kova: Open Settings** to change provider/model settings, context budget and the exact Auto command allowlist. Context shows estimated input before generation and measured input/output after the final chunk.

Attach a selection, current file or chosen files with **Add context**. While either chat view has focus, selection/current-file attachments use the most recently active file editor. In Manual mode, inspect the file diff or command and choose **Allow once** or **Reject**. Stale file versions require a new preview. Editor Undo restores file edits; cancellation does not undo applied changes.

Context defaults to 32,768 tokens with 4,096 reserved for output and a 10% safety margin. Existing explicit user/workspace settings take precedence. See [USAGE.md](USAGE.md) for thinking display, skill selection and MCP setup.

Use trusted projects. `.kova/mcp.json` can start local servers and `.kova/hooks.json` can execute local hooks without an additional Kova trust prompt. These processes use your user privileges. Protected configuration writes always require approval.

For source development, run `npm ci`, `npm run check` and `npm run build`, then press F5 in VS Code. `npm run package` creates `dist/kova-local-0.3.1.vsix`; the filename follows the extension manifest name and version. Run `npm run verify:package` to inspect the archive and `npm run smoke:vsix` to test an isolated installation.

For tool use with the supplied Qwen3 installation, enable Thinking. The local Ollama 0.35.0/Qwen3 combination previously produced reasoning as ordinary text and reached its output limit with `think: false`; `think: true` returned native tool calls. Kova preserves the requested setting and does not execute tool-like text.
