import * as vscode from 'vscode';
import { ChatSession } from '../extension/ChatSession.js';
import type { WorkspaceConversationRepository } from '../extension/conversationStore.js';
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
  private lastConversationId: string | null = null;
  private readonly unsubscribeSession: () => void;
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly session: ChatSession,
    private readonly openEditor: () => Promise<void>,
    private readonly conversations: WorkspaceConversationRepository,
  ) {
    // Refresh the launcher history whenever the active conversation changes
    // (new chat via /clear or the command, reopened history row).
    this.unsubscribeSession = this.session.connect((message) => {
      if (message.type !== 'Snapshot') return;
      const id = message.snapshot.conversationId;
      if (id !== this.lastConversationId) {
        this.lastConversationId = id;
        if (this.launcher) void this.render();
      }
    });
  }
  private get launcher(): boolean {
    return (
      vscode.workspace.getConfiguration('kova').get<string>('chat.openIn', 'editor') !== 'sidebar'
    );
  }
  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    this.view = view;
    const visibility = view.onDidChangeVisibility(() => {
      if (view.visible && this.launcher) {
        void this.render();
        void this.openEditor();
      }
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
      const history = await this.conversations.list();
      this.listeners.push(
        renderLauncher(
          view.webview,
          this.context.extensionUri,
          this.session.currentConversationId(),
          history,
          (action, id) => {
            if (action === 'history' && id) {
              void this.openHistory(id);
              return;
            }
            if (action === 'history-delete' && id) {
              void this.deleteHistory(id);
              return;
            }
            const command = {
              open: 'kova.openInEditor',
              new: 'kova.newConversation',
              setup: 'kova.setup',
              key: 'kova.setProviderApiKey',
              settings: 'kova.settings',
            }[action];
            if (command) void vscode.commands.executeCommand(command);
          },
        ),
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
  /** Opens a stored conversation from the launcher history. */
  private async openHistory(id: string): Promise<void> {
    try {
      await vscode.commands.executeCommand('kova.open');
      await this.session.openConversation(id);
      await this.render();
    } catch (error) {
      await vscode.window.showErrorMessage(
        error instanceof Error ? error.message : 'Could not open the conversation.',
      );
    }
  }
  /** Deletes a stored conversation; the active one is replaced by a fresh chat. */
  private async deleteHistory(id: string): Promise<void> {
    try {
      await this.conversations.remove(id);
      if (id === this.session.currentConversationId()) {
        await this.session.newConversation();
        await this.session.snapshot('deleted-active');
      }
      await this.render();
    } catch (error) {
      await vscode.window.showErrorMessage(
        error instanceof Error ? error.message : 'Could not delete the conversation.',
      );
    }
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
    this.unsubscribeSession();
    this.release();
    this.view = null;
  }
}
