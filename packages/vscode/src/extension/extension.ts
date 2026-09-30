import * as vscode from 'vscode';
import { ChatSession } from './ChatSession.js';
import { KovaPanelController } from '../webview/KovaPanelController.js';
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
  const panels = new KovaPanelController(context, session);
  const sidebar = new KovaViewProvider(context, session);
  session.captureEditor(vscode.window.activeTextEditor);
  context.subscriptions.push(
    output,
    panels,
    sidebar,
    vscode.window.onDidChangeActiveTextEditor((editor) => session?.captureEditor(editor)),
    vscode.workspace.registerTextDocumentContentProvider('kova-diff', session.approval),
    vscode.window.registerWebviewViewProvider('kova.chat', sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('kova.open', async () => {
      session?.captureEditor(vscode.window.activeTextEditor);
      await vscode.commands.executeCommand('workbench.view.extension.kova');
      sidebar.show();
    }),
    vscode.commands.registerCommand('kova.openInEditor', () => panels.show()),
    vscode.commands.registerCommand('kova.newConversation', async () => {
      await session?.newConversation();
      await session?.snapshot('new-chat');
      await vscode.commands.executeCommand('kova.open');
    }),
    vscode.commands.registerCommand('kova.settings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:owlcoder.kova'),
    ),
  );
  return { session, sidebar };
}
export async function deactivate(): Promise<void> {
  await session?.dispose();
  session = undefined;
}
