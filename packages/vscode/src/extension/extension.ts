import * as vscode from 'vscode';
import { ChatSession } from './ChatSession.js';
import { KovaViewProvider } from '../webview/KovaViewProvider.js';

let session: ChatSession | undefined;
export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('Kova');
  const root =
    (vscode.window.activeTextEditor
      ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
      : undefined
    )?.uri.fsPath ??
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
    null;
  session = new ChatSession(context, root, output);
  const provider = new KovaViewProvider(context, session);
  context.subscriptions.push(
    output,
    vscode.workspace.registerTextDocumentContentProvider('kova-diff', session.approval),
    vscode.window.registerWebviewViewProvider('kova.chat', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('kova.open', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.kova');
      provider.show();
    }),
    vscode.commands.registerCommand('kova.newConversation', async () => {
      await session?.newConversation();
      await session?.snapshot('new-chat');
    }),
    vscode.commands.registerCommand('kova.settings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:owlcoder.kova'),
    ),
  );
  return { session };
}
export async function deactivate(): Promise<void> {
  await session?.dispose();
  session = undefined;
}
