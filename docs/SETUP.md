# Kova setup

Install and start Ollama, then install the default model once:

```sh
ollama pull qwen3:4b
```

Install Kova from its VSIX with **Extensions: Install from VSIX**. Run **Kova: Open Chat** or select Kova in the Activity Bar to open the sidebar, then select an installed model and enter a prompt. Use **Kova: Open Chat in Editor** for a movable editor tab. Both views share the session conversation. Opening the editor command again focuses the existing tab. Closing the tab cancels active work; hiding the sidebar does not. **Stop** cancels the active run. **New conversation** clears the current chat.

The default endpoint is `http://127.0.0.1:11434`. If it is unavailable, start Ollama and press **Retry**. If the selected model is missing, select an installed model or install it through Ollama. Models without confirmed tool support run chat only.

Use **Kova: Open Settings** to change the model, endpoint, thinking, keep-alive, context budget and exact Auto command allowlist. Context shows estimated input before generation and measured input/output after the final chunk.

Attach a selection, current file or chosen files with **+**. While either chat view has focus, selection/current-file attachments use the most recently active file editor. In Manual mode, inspect the file diff or command and choose **Allow once** or **Reject**. Stale file versions require a new preview. Editor Undo restores file edits; cancellation does not undo applied changes.

Use trusted projects. `.kova/mcp.json` can start local servers and `.kova/hooks.json` can execute local hooks without an additional Kova trust prompt. These processes use your user privileges. Protected configuration writes always require approval.

For source development, run `npm ci`, `npm run check` and `npm run build`, then press F5 in VS Code. `npm run package` creates `dist/kova-0.2.0.vsix`; the filename follows the extension manifest version. Run `npm run verify:package` to inspect the archive and `npm run smoke:vsix` to test an isolated installation.

For tool use with the supplied Qwen3 installation, enable Thinking. The local Ollama 0.35.0/Qwen3 combination produced reasoning as ordinary text and reached its output limit with `think: false`; `think: true` returned native tool calls. Kova preserves the requested setting and does not execute tool-like text.
