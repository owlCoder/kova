import * as vscode from 'vscode';
import type { ProviderApiKeyStore } from './ProviderApiKeyStore.js';
import type { ProviderManager } from './ProviderManager.js';

export async function editProviderCredential(
  providers: ProviderManager,
  keys: ProviderApiKeyStore,
  clear: boolean,
): Promise<boolean> {
  const { kind, label, baseUrl } = providers.configuration();
  if (kind === 'ollama') {
    await vscode.window.showInformationMessage('Ollama does not require an API key.');
    return false;
  }
  if (clear) await keys.delete(kind, baseUrl);
  else {
    const value = await vscode.window.showInputBox({
      password: true,
      ignoreFocusOut: true,
      title: `Kova: Set ${label} API Key`,
      prompt: 'Stored in VS Code SecretStorage for this endpoint, not settings.json.',
      validateInput: (value) => (!value.trim() ? 'API key cannot be empty.' : undefined),
    });
    if (value === undefined) return false;
    if (!value.trim()) return false;
    await keys.set(kind, value.trim(), baseUrl);
  }
  providers.clear();
  await vscode.window.showInformationMessage(
    `${label} API key ${clear ? 'removed' : 'saved securely'}.`,
  );
  return true;
}
