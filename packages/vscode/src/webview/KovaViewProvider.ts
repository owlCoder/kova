import * as vscode from 'vscode';
import { ChatSession } from '../extension/ChatSession.js';
import { KovaWebviewHost } from './KovaWebviewHost.js';
import { renderLauncher } from './KovaLauncherView.js';

/**
 * The Activity Bar view. With `kova.chat.openIn` = editor (default) it is a
 * launcher that opens the conversation as an editor tab, like other agent
 * tabs; with `sidebar` it hosts the full conversation.
 */
export class KovaViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | null = null;
  private host: KovaWebviewHost | null = null;
  private listeners: vscode.Disposable[] = [];
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly session: ChatSession,
    private readonly openEditor: () => Promise<void>,
  ) {}
  private get launcher(): boolean {
    return (
      vscode.workspace.getConfiguration('kova').get<string>('chat.openIn', 'editor') !== 'sidebar'
    );
  }
  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    this.view = view;
    const visibility = view.onDidChangeVisibility(() => {
      if (view.visible && this.launcher) void this.openEditor();
    });
    const close = view.onDidDispose(() => {
      close.dispose();
      visibility.dispose();
      if (this.view === view) {
        this.release();
        this.view = null;
      }
    });
    await this.render();
    if (this.launcher) await this.openEditor();
  }
  /** Re-renders after provider or placement settings change. */
  async render(): Promise<void> {
    const view = this.view;
    if (!view) return;
    this.release();
    if (this.launcher) {
      view.title = 'Kova';
      this.listeners.push(
        renderLauncher(view.webview, (action) => {
          const command = {
            open: 'kova.openInEditor',
            new: 'kova.newConversation',
            setup: 'kova.setup',
            key: 'kova.setProviderApiKey',
            settings: 'kova.settings',
          }[action];
          if (command) void vscode.commands.executeCommand(command);
        }),
      );
      return;
    }
    const host = new KovaWebviewHost(this.context, this.session, view.webview, 'Sidebar');
    this.host = host;
    await host.initialize();
  }
  show(): void {
    this.view?.show(false);
  }
  get visible(): boolean {
    return this.view?.visible ?? false;
  }
  private release(): void {
    this.host?.dispose();
    this.host = null;
    for (const listener of this.listeners.splice(0)) listener.dispose();
  }
  dispose(): void {
    this.release();
    this.view = null;
  }
}
