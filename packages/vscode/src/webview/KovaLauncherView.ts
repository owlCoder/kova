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
const icons: Readonly<Record<string, string>> = {
  open: '<path d="M4 5h16v11H8l-4 4z"/>',
  new: '<path d="M12 5v14M5 12h14"/>',
  setup: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
  key: '<circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M17 5l2 2M15 7l2 2"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
};
const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] ?? ''}</svg>`;

export function renderLauncher(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  run: (action: string) => void,
) {
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
  const media = vscode.Uri.joinPath(extensionUri, 'media');
  webview.options = { enableScripts: true, localResourceRoots: [media] };
  const logo = webview.asWebviewUri(vscode.Uri.joinPath(media, 'logo.png'));
  const row = (action: string, label: string) =>
    `<button class="row" data-action="${action}">${icon(action)}<span>${escape(label)}</span><i>›</i></button>`;
  webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
:root{--brand:#d9a37a;--brand-2:#c4865a;--on-brand:#1d1712;--card:color-mix(in srgb,var(--vscode-foreground) 5%,transparent);--line:var(--vscode-widget-border,color-mix(in srgb,var(--vscode-foreground) 12%,transparent));--muted:var(--vscode-descriptionForeground)}
body.vscode-light,body.vscode-high-contrast-light{--brand:#b06a36;--brand-2:#97572a;--on-brand:#fff}
*{box-sizing:border-box}
body{margin:0;padding:12px 12px 18px;font:var(--vscode-font-size) var(--vscode-font-family);color:var(--vscode-foreground)}
.hero{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--line);border-radius:12px;background:linear-gradient(135deg,color-mix(in srgb,var(--brand) 16%,transparent),transparent 70%)}
.hero img{width:34px;height:34px;object-fit:contain}
.hero b{display:block;font-size:14px}.hero small{color:var(--muted)}
h2{margin:18px 2px 7px;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.card{border:1px solid var(--line);border-radius:10px;background:var(--card);overflow:hidden}
dl{display:grid;grid-template-columns:auto 1fr;gap:7px 12px;margin:0;padding:10px 12px}
dt{color:var(--muted)}dd{margin:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.status{display:inline-flex;align-items:center;gap:6px}.status::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--brand)}
.primary{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:12px;padding:9px 12px;border:0;border-radius:9px;background:linear-gradient(180deg,var(--brand),var(--brand-2));color:var(--on-brand);font:inherit;font-weight:600;cursor:pointer;box-shadow:0 1px 0 rgb(255 255 255 / .15) inset,0 4px 14px color-mix(in srgb,var(--brand) 25%,transparent)}
.primary:hover{filter:brightness(1.06)}.primary svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.row{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border:0;border-top:1px solid var(--line);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.row:first-child{border-top:0}.row:hover,.row:focus-visible{outline:none;background:color-mix(in srgb,var(--brand) 10%,transparent)}
.row svg{flex:none;width:15px;height:15px;fill:none;stroke:var(--brand);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.row span{flex:1}.row i{font-style:normal;color:var(--muted)}
ul{margin:0;padding:8px 12px;list-style:none;display:grid;gap:7px;color:var(--muted)}
kbd{display:inline-block;min-width:18px;padding:0 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:4px;font-family:var(--vscode-editor-font-family);font-size:10.5px;text-align:center;color:var(--vscode-foreground)}
</style></head><body>
<div class="hero"><img src="${logo}" alt=""><div><b>Kova</b><small>Local-first coding agent</small></div></div>
<button class="primary" data-action="open">${icon('open')}Open Kova</button>
<h2>Connection</h2>
<div class="card"><dl><dt>Provider</dt><dd><span class="status">${escape(providerName[kind] ?? kind)}</span></dd>
<dt>Model</dt><dd title="${escape(model)}">${escape(model)}</dd>
${host ? `<dt>Endpoint</dt><dd title="${escape(host)}">${escape(host)}</dd>` : ''}</dl></div>
<h2>Actions</h2>
<div class="card">${row('new', 'New conversation')}${row('setup', 'Set up AI provider')}${row('key', 'Set provider API key')}${row('settings', 'Kova settings')}</div>
<h2>Shortcuts</h2>
<div class="card"><ul><li>${key(mac ? '⌘⌥K' : 'Ctrl+Alt+K')} open Kova</li>
<li>${key('⇧Tab')} switch permission mode</li>
<li>${key('Esc')} interrupt a running task</li>
<li>${key('1')} ${key('2')} allow / reject a request</li>
<li>Right-click a file → <b>Add to Kova Context</b></li></ul></div>
<script nonce="${nonce}">const vscode=acquireVsCodeApi();document.addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(b)vscode.postMessage({action:b.dataset.action});});</script>
</body></html>`;
  return webview.onDidReceiveMessage((raw: unknown) => {
    const action = (raw as { action?: unknown } | null)?.action;
    if (typeof action === 'string' && actions.has(action)) run(action);
  });
}
