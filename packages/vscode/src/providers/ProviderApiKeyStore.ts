import type * as vscode from 'vscode';
import type { ProviderKind } from './ProviderKind.js';

export class ProviderApiKeyStore {
  constructor(private readonly secrets: vscode.SecretStorage | undefined) {}

  async get(provider: ProviderKind): Promise<string | undefined> {
    if (provider === 'ollama' || !this.secrets) return undefined;
    return await this.secrets.get(this.key(provider));
  }

  async set(provider: ProviderKind, value: string): Promise<void> {
    if (provider === 'ollama') throw new Error('Ollama does not use an API key.');
    if (!this.secrets) throw new Error('VS Code secret storage is unavailable.');
    await this.secrets.store(this.key(provider), value);
  }

  async delete(provider: ProviderKind): Promise<void> {
    if (provider === 'ollama' || !this.secrets) return;
    await this.secrets.delete(this.key(provider));
  }

  private key(provider: ProviderKind): string {
    return `kova.provider.${provider}.apiKey`;
  }
}
