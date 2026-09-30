import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { ChatSession } from '../extension/ChatSession.js';
import { validateMessage } from './validateMessage.js';

export class KovaWebviewHost implements vscode.Disposable {
  private readonly disconnect: () => void;
  private readonly receive: vscode.Disposable;
  private disposed = false;
  constructor(
    context: vscode.ExtensionContext,
    private readonly session: ChatSession,
    webview: vscode.Webview,
    presentation: 'Sidebar' | 'Editor',
  ) {
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview')],
    };
    this.disconnect = session.connect((message) => {
      if (!this.disposed) void webview.postMessage(message).then(undefined, () => {});
    });
    this.receive = webview.onDidReceiveMessage((raw: unknown) => {
      let id = 'invalid';
      try {
        const message = validateMessage(raw);
        id = message.requestId;
        void session
          .handle(message)
          .catch((error: unknown) =>
            session.reject(id, error instanceof Error ? error.message : 'Request failed.'),
          );
      } catch (error) {
        session.reject(id, error instanceof Error ? error.message : 'Invalid message.');
      }
    });
    const nonce = randomBytes(16).toString('hex');
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'webview/assets/main.js'),
    );
    const css = webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'webview/assets/index.css'),
    );
    webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};"><link rel="stylesheet" href="${css}"><title>Kova</title></head><body class="${presentation === 'Editor' ? 'editor' : 'sidebar'}"><div id="root"></div><script nonce="${nonce}" type="module" src="${script}"></script></body></html>`;
  }
  async initialize(): Promise<void> {
    await this.session
      .initialize()
      .catch((error: unknown) =>
        this.session.reject(
          'initialize',
          error instanceof Error ? error.message : 'Initialization failed.',
        ),
      );
    if (!this.disposed) await this.session.snapshot('initialize');
  }
  dispose(): void {
    this.disposed = true;
    this.disconnect();
    this.receive.dispose();
  }
}
