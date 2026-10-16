import * as vscode from 'vscode';
import { ProviderApiKeyStore } from '../providers/ProviderApiKeyStore.js';
import { ProviderManager } from '../providers/ProviderManager.js';
import { ProviderSetupWizard } from '../providers/ProviderSetupWizard.js';
import { editProviderCredential } from '../providers/editProviderCredential.js';
import { KovaPanelController } from '../webview/KovaPanelController.js';
import { KovaViewProvider } from '../webview/KovaViewProvider.js';
import { ChatSession } from './ChatSession.js';

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
  const apiKeys = new ProviderApiKeyStore(context.secrets);
  const providers = new ProviderManager(apiKeys);
  session = new ChatSession(context, root, output, providers);
  const panels = new KovaPanelController(context, session);
  const sidebar = new KovaViewProvider(context, session);
  session.captureEditor(vscode.window.activeTextEditor);

  const configure = async (action: () => Promise<boolean>) => {
    try {
      await session?.configureProvider(action);
    } catch (error) {
      await vscode.window.showErrorMessage(
        error instanceof Error ? error.message : 'Provider setup failed.',
      );
    }
  };

  context.subscriptions.push(
    output,
    panels,
    sidebar,
    vscode.window.onDidChangeActiveTextEditor((editor) => session?.captureEditor(editor)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('kova'))
        void session
          ?.configurationChanged()
          .catch(() => output.appendLine('[ProviderRefreshFailed]'));
    }),
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
    vscode.commands.registerCommand('kova.setup', () =>
      configure(() => new ProviderSetupWizard(providers, apiKeys).run()),
    ),
    vscode.commands.registerCommand('kova.newConversation', async () => {
      await session?.newConversation();
      await session?.snapshot('new-chat');
      await vscode.commands.executeCommand('kova.open');
    }),
    vscode.commands.registerCommand('kova.settings', () =>
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        `@ext:${context.extension.id}`,
      ),
    ),
    vscode.commands.registerCommand('kova.setProviderApiKey', () =>
      configure(() => editProviderCredential(providers, apiKeys, false)),
    ),
    vscode.commands.registerCommand('kova.clearProviderApiKey', () =>
      configure(() => editProviderCredential(providers, apiKeys, true)),
    ),
  );
  return { session, sidebar };
}

export async function deactivate(): Promise<void> {
  await session?.dispose();
  session = undefined;
}
