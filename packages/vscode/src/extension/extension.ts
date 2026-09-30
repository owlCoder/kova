import * as vscode from 'vscode';
import { ProviderApiKeyStore } from '../providers/ProviderApiKeyStore.js';
import { ProviderManager } from '../providers/ProviderManager.js';
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

  const refreshCredentials = async () => {
    providers.clear();
    await session?.refreshModels();
    await session?.snapshot('provider-credentials');
  };

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
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        `@ext:${context.extension.id}`,
      ),
    ),
    vscode.commands.registerCommand('kova.setProviderApiKey', async () => {
      const provider = providers.kind();
      if (provider === 'ollama') {
        await vscode.window.showInformationMessage('Ollama does not require an API key.');
        return;
      }
      const value = await vscode.window.showInputBox({
        password: true,
        ignoreFocusOut: true,
        title: `Kova: Set ${providers.label()} API Key`,
        prompt: 'Stored in VS Code SecretStorage, not settings.json.',
      });
      if (value === undefined) return;
      if (!value.trim()) {
        await vscode.window.showWarningMessage('API key cannot be empty.');
        return;
      }
      await apiKeys.set(provider, value.trim());
      await refreshCredentials();
      await vscode.window.showInformationMessage(`${providers.label()} API key saved securely.`);
    }),
    vscode.commands.registerCommand('kova.clearProviderApiKey', async () => {
      const provider = providers.kind();
      if (provider === 'ollama') {
        await vscode.window.showInformationMessage('Ollama does not use an API key.');
        return;
      }
      await apiKeys.delete(provider);
      await refreshCredentials();
      await vscode.window.showInformationMessage(`${providers.label()} API key removed.`);
    }),
  );
  return { session, sidebar };
}

export async function deactivate(): Promise<void> {
  await session?.dispose();
  session = undefined;
}
