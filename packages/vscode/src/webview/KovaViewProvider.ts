import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { ChatSession } from '../extension/ChatSession.js';
import { validateMessage } from './validateMessage.js';

export class KovaViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;
  constructor(
    private readonly context: vscode.ExtensionContext,
    readonly session: ChatSession,
  ) {}
  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'webview')],
    };
    const nonce = randomBytes(16).toString('hex');
    const script = view.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'webview/assets/main.js'),
    );
    const css = view.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'webview/assets/index.css'),
    );
    view.webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${view.webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${view.webview.cspSource} data:; font-src ${view.webview.cspSource};"><link rel="stylesheet" href="${css}"><title>Kova</title></head><body><div id="root"></div><script nonce="${nonce}" type="module" src="${script}"></script></body></html>`;
    this.session.connect((message) => {
      void view.webview.postMessage(message);
    });
    this.context.subscriptions.push(
      view.webview.onDidReceiveMessage((raw: unknown) => {
        let id = 'invalid';
        try {
          const message = validateMessage(raw);
          id = message.requestId;
          void this.session
            .handle(message)
            .catch((error: unknown) =>
              this.session.reject(id, error instanceof Error ? error.message : 'Request failed.'),
            );
        } catch (error) {
          this.session.reject(id, error instanceof Error ? error.message : 'Invalid message.');
        }
      }),
    );
    await this.session
      .initialize()
      .catch((error: unknown) =>
        this.session.reject(
          'initialize',
          error instanceof Error ? error.message : 'Initialization failed.',
        ),
      );
    await this.session.snapshot('initialize');
  }
  show(): void {
    this.view?.show(false);
  }
}
