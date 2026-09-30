import * as vscode from 'vscode';
import { ChatSession } from '../extension/ChatSession.js';
import { KovaWebviewHost } from './KovaWebviewHost.js';

export class KovaPanelController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | null = null;
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly session: ChatSession,
  ) {}
  async show(): Promise<void> {
    this.session.captureEditor(vscode.window.activeTextEditor);
    if (this.panel) {
      this.panel.reveal(this.panel.viewColumn, false);
      return;
    }
    const panel = vscode.window.createWebviewPanel('kova.chat', 'Kova', vscode.ViewColumn.Active, {
      retainContextWhenHidden: true,
    });
    this.panel = panel;
    panel.iconPath = {
      light: vscode.Uri.joinPath(this.context.extensionUri, 'media/logo.png'),
      dark: vscode.Uri.joinPath(this.context.extensionUri, 'media/activity-icon.svg'),
    };
    const host = new KovaWebviewHost(this.context, this.session, panel.webview, 'Editor');
    const close = panel.onDidDispose(() => {
      host.dispose();
      close.dispose();
      if (this.panel === panel) {
        this.panel = null;
        this.session.cancelActiveRun();
      }
    });
    await host.initialize();
  }
  dispose(): void {
    this.panel?.dispose();
  }
}
