import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';

const modelSetting: Readonly<Record<string, string>> = {
  ollama: 'ollama.model',
  deepseek: 'deepseek.model',
  openaiCompatible: 'openaiCompatible.model',
};
const urlSetting: Readonly<Record<string, string>> = {
  ollama: 'ollama.baseUrl',
  deepseek: 'deepseek.baseUrl',
  openaiCompatible: 'openaiCompatible.baseUrl',
};
const providerName: Readonly<Record<string, string>> = {
  ollama: 'Ollama (local)',
  deepseek: 'DeepSeek',
  openaiCompatible: 'OpenAI-compatible',
};
const actions = new Set(['open', 'new', 'setup', 'key', 'settings']);

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/**
 * Activity Bar launcher shown when the conversation lives in an editor tab:
 * provider summary, actions and shortcuts. It renders static HTML from
 * settings only and accepts a fixed set of action names from the view.
 */
export function renderLauncher(webview: vscode.Webview, run: (action: string) => void) {
  const config = vscode.workspace.getConfiguration('kova');
  const kind = config.get<string>('provider', 'ollama');
  const model = config.get<string>(modelSetting[kind] ?? '', '') || 'first available model';
  let host = '';
  try {
    host = new URL(config.get<string>(urlSetting[kind] ?? '', '')).host;
  } catch {
    host = '';
  }
  const nonce = randomBytes(16).toString('hex');
  const mac = process.platform === 'darwin';
  const key = (k: string) => `<kbd>${escape(k)}</kbd>`;
  webview.options = { enableScripts: true, localResourceRoots: [] };
  webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
body{margin:0;padding:6px 14px 16px;font:var(--vscode-font-size) var(--vscode-font-family);color:var(--vscode-foreground)}
h2{margin:16px 0 8px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--vscode-descriptionForeground)}
dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0}
dt{color:var(--vscode-descriptionForeground)}dd{margin:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
button{display:flex;align-items:center;gap:6px;width:100%;margin:0 0 6px;padding:6px 10px;border:1px solid var(--vscode-button-border,transparent);border-radius:4px;font:inherit;cursor:pointer;text-align:left;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
button:hover{background:var(--vscode-button-secondaryHoverBackground)}
button.primary{justify-content:center;background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
button.primary:hover{background:var(--vscode-button-hoverBackground)}
ul{margin:0;padding:0;list-style:none;display:grid;gap:6px;color:var(--vscode-descriptionForeground)}
kbd{padding:0 4px;border:1px solid var(--vscode-widget-border,#444);border-radius:3px;font-family:var(--vscode-editor-font-family);font-size:11px;color:var(--vscode-foreground)}
</style></head><body>
<h2>Connection</h2>
<dl><dt>Provider</dt><dd title="${escape(providerName[kind] ?? kind)}">${escape(providerName[kind] ?? kind)}</dd>
<dt>Model</dt><dd title="${escape(model)}">${escape(model)}</dd>
${host ? `<dt>Endpoint</dt><dd title="${escape(host)}">${escape(host)}</dd>` : ''}</dl>
<h2>Conversation</h2>
<button class="primary" data-action="open">Open Kova</button>
<button data-action="new">New conversation</button>
<h2>Setup</h2>
<button data-action="setup">Set up AI provider</button>
<button data-action="key">Set provider API key</button>
<button data-action="settings">Kova settings</button>
<h2>Shortcuts</h2>
<ul><li>${key(mac ? '⌘⌥K' : 'Ctrl+Alt+K')} open Kova</li>
<li>${key('⇧Tab')} switch permission mode</li>
<li>${key('Esc')} interrupt a running task</li>
<li>${key('1')} / ${key('2')} allow / reject a request</li>
<li>Right-click a file → <b>Add to Kova Context</b></li></ul>
<script nonce="${nonce}">const vscode=acquireVsCodeApi();document.addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(b)vscode.postMessage({action:b.dataset.action});});</script>
</body></html>`;
  return webview.onDidReceiveMessage((raw: unknown) => {
    const action = (raw as { action?: unknown } | null)?.action;
    if (typeof action === 'string' && actions.has(action)) run(action);
  });
}
