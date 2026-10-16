import type * as vscode from 'vscode';
import { createHash } from 'node:crypto';
import type { ProviderKind } from '../../../runtime/src/providers/ProviderKind.js';

export class ProviderApiKeyStore {
  constructor(private readonly secrets: vscode.SecretStorage | undefined) {}

  async get(provider: ProviderKind, endpoint?: string): Promise<string | undefined> {
    if (provider === 'ollama' || !this.secrets) return undefined;
    const value = await this.secrets.get(this.key(provider, endpoint));
    if (value || !endpoint) return value;
    // Bind an older installation's credential to its current endpoint once.
    const legacy = await this.secrets.get(this.key(provider));
    if (legacy) {
      await this.set(provider, legacy, endpoint);
      await this.secrets.delete(this.key(provider));
    }
    return legacy;
  }

  async set(provider: ProviderKind, value: string, endpoint?: string): Promise<void> {
    if (provider === 'ollama') throw new Error('Ollama does not use an API key.');
    if (!this.secrets) throw new Error('VS Code secret storage is unavailable.');
    await this.secrets.store(this.key(provider, endpoint), value);
    if (endpoint) await this.secrets.delete(this.key(provider));
  }

  async delete(provider: ProviderKind, endpoint?: string): Promise<void> {
    if (provider === 'ollama' || !this.secrets) return;
    await this.secrets.delete(this.key(provider, endpoint));
    if (endpoint) await this.secrets.delete(this.key(provider));
  }

  private key(provider: ProviderKind, endpoint?: string): string {
    const suffix = endpoint
      ? `.${createHash('sha256').update(endpoint.replace(/\/+$/, '')).digest('hex')}`
      : '';
    return `kova.provider.${provider}${suffix}.apiKey`;
  }
}
