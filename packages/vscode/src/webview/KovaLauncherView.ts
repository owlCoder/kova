import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { ConversationHistoryEntry } from '../extension/conversationStore.js';

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
const actions = new Set([
  'open',
  'new',
  'setup',
  'key',
  'settings',
  'history',
  'history-delete',
  'history-rename',
]);

const relativeTime = (timestamp: number): string => {
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
};

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
  shortcuts:
    '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M17 10h.01M7 14h10"/>',
  delete: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20l4-1L20 7l-3-3L5 16l-1 4z"/>',
};
const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] ?? ''}</svg>`;

export function renderLauncher(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  activeId: string,
  history: readonly ConversationHistoryEntry[],
  run: (action: string, id?: string) => void,
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
  const historyRow = (item: ConversationHistoryEntry) =>
    `<button class="row${item.id === activeId ? ' active' : ''}" data-action="history" data-id="${escape(item.id)}" title="${escape(item.title)}"><span>${escape(item.title)}</span><small>${relativeTime(item.updatedAt)}</small></button>`;
  const conversations =
    history.length > 0
      ? `<h2>Conversations</h2><input id="history-search" type="search" placeholder="Search conversations…" aria-label="Search conversations"><div class="card" id="history-card">${history.map(historyRow).join('')}</div>`
      : '';
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
.row{display:flex;align-items:center;gap:10px;width:100%;padding:10px 13px;border:0;border-top:1px solid var(--line);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.row:first-child{border-top:0}.row:hover,.row:focus-visible{outline:none;background:color-mix(in srgb,var(--brand) 10%,transparent)}
.row svg{flex:none;width:16px;height:16px;fill:none;stroke:var(--brand);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.row span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row i{font-style:normal;color:var(--muted)}
.row small{flex:none;font-size:10.5px;color:var(--muted)}
.row.active{background:color-mix(in srgb,var(--brand) 14%,transparent)}
#history-search{width:100%;margin:0 0 7px;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:inherit;font:inherit;font-size:12px}
#history-search:focus{outline:1px solid var(--brand)}
ul{margin:0;padding:8px 12px;list-style:none;display:grid;gap:7px;color:var(--muted)}
kbd{display:inline-block;min-width:18px;padding:0 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:4px;font-family:var(--vscode-editor-font-family);font-size:10.5px;text-align:center;color:var(--vscode-foreground)}
/* Popup card shared by the right-click menu and the shortcuts popover. */
.pop{position:fixed;z-index:60;display:grid;gap:1px;min-width:170px;padding:5px;border:0;border-radius:10px;background:var(--vscode-quickInput-background,var(--vscode-editorWidget-background,#202020));box-shadow:0 16px 48px rgb(0 0 0 / .4)}
.pop[hidden]{display:none}
.pop button{display:flex;align-items:center;gap:9px;width:100%;padding:7px 10px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:12.5px;text-align:left;cursor:pointer}
.pop button:hover,.pop button:focus-visible{outline:none;background:var(--vscode-list-hoverBackground,rgb(255 255 255 / .06))}
.pop button svg{flex:none;width:14px;height:14px;fill:none;stroke:var(--muted);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.pop button.danger{color:var(--vscode-errorForeground,#f48771)}
.pop button.danger svg{stroke:currentColor}
#shortcuts-btn{anchor-name:--shortcuts-btn}
#shortcuts-pop:not(:popover-open){display:none}
#shortcuts-pop{position-anchor:--shortcuts-btn;inset:auto;position:absolute;top:anchor(bottom);left:anchor(left);margin:6px 0 0;min-width:250px;max-width:280px}
#shortcuts-pop ul{padding:6px 10px;font-size:12px}
</style></head><body>
<div class="hero"><img src="${logo}" alt=""><div><b>Kova</b><small>Local-first coding agent</small></div></div>
<button class="primary" data-action="open">${icon('open')}Open Kova</button>
${conversations}
<h2>Connection</h2>
<div class="card"><dl><dt>Provider</dt><dd><span class="status">${escape(providerName[kind] ?? kind)}</span></dd>
<dt>Model</dt><dd title="${escape(model)}">${escape(model)}</dd>
${host ? `<dt>Endpoint</dt><dd title="${escape(host)}">${escape(host)}</dd>` : ''}</dl></div>
<h2>Actions</h2>
<div class="card">${row('new', 'New conversation')}${row('setup', 'Set up AI provider')}${row('key', 'Set provider API key')}${row('settings', 'Kova settings')}<button class="row" id="shortcuts-btn" popovertarget="shortcuts-pop">${icon('shortcuts')}<span>Shortcuts</span><i>›</i></button></div>
<div id="shortcuts-pop" class="pop" popover="auto"><ul><li>${key(mac ? '⌘⌥K' : 'Ctrl+Alt+K')} open Kova</li>
<li>${key('⇧Tab')} switch permission mode</li>
<li>${key('Esc')} interrupt a running task</li>
<li>${key('↑')} ${key('↓')} navigate messages</li>
<li>${key('E')} edit last message · ${key('R')} resend it</li>
<li>${key('1')} ${key('2')} allow / reject a request</li>
<li>Right-click a file → <b>Add to Kova Context</b></li></ul></div>
<div id="ctx" class="pop" hidden>
<button data-action="history">${icon('open')}Open</button>
<button data-action="history-rename">${icon('edit')}Rename</button>
<button data-action="history-delete" class="danger">${icon('delete')}Delete</button>
</div>
<script nonce="${nonce}">const vscode=acquireVsCodeApi();const ctx=document.getElementById('ctx');let ctxId=null;const hide=()=>{ctx.hidden=true};
document.addEventListener('click',e=>{const item=e.target.closest('#ctx button');if(item){hide();vscode.postMessage({action:item.dataset.action,id:ctxId});return}hide();const b=e.target.closest('button[data-action]');if(b)vscode.postMessage({action:b.dataset.action,id:b.dataset.id||undefined})});
document.addEventListener('contextmenu',e=>{const b=e.target.closest('button[data-action="history"]');if(!b)return;e.preventDefault();ctxId=b.dataset.id;ctx.hidden=false;const r=ctx.getBoundingClientRect();ctx.style.left=Math.max(8,Math.min(e.clientX,innerWidth-r.width-8))+'px';ctx.style.top=Math.max(8,Math.min(e.clientY,innerHeight-r.height-8))+'px'});
document.addEventListener('keydown',e=>{if(e.key==='Escape')hide()});window.addEventListener('blur',hide);
const search=document.getElementById('history-search');if(search){search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();for(const row of document.querySelectorAll('#history-card .row')){row.style.display=row.textContent.toLowerCase().includes(q)?'':'none'}})}</script>
</body></html>`;
  return webview.onDidReceiveMessage((raw: unknown) => {
    const message = raw as { action?: unknown; id?: unknown } | null;
    if (typeof message?.action === 'string' && actions.has(message.action))
      run(message.action, typeof message.id === 'string' ? message.id : undefined);
  });
}
