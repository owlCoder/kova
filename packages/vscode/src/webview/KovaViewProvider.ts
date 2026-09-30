import * as vscode from 'vscode';
import { ChatSession } from '../extension/ChatSession.js';
import { KovaWebviewHost } from './KovaWebviewHost.js';

export class KovaViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | null = null;
  private host: KovaWebviewHost | null = null;
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly session: ChatSession,
  ) {}
  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    this.host?.dispose();
    this.view = view;
    const host = new KovaWebviewHost(this.context, this.session, view.webview, 'Sidebar');
    this.host = host;
    const close = view.onDidDispose(() => {
      host.dispose();
      close.dispose();
      if (this.view === view) {
        this.view = null;
        this.host = null;
      }
    });
    await host.initialize();
  }
  show(): void {
    this.view?.show(false);
  }
  get visible(): boolean {
    return this.view?.visible ?? false;
  }
  dispose(): void {
    this.host?.dispose();
    this.host = null;
    this.view = null;
  }
}
