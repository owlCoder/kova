import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { LlmProvider } from '../../../core/src/providers/LlmProvider.js';
import type { ModelInfo } from '../../../core/src/models/ModelInfo.js';
import { discoverProviderModels } from '../../../runtime/src/providers/discoverProviderModels.js';
import { createLlmProvider } from '../../../runtime/src/providers/createLlmProvider.js';
import type { DesktopStore } from '../state/DesktopStore.js';
import type { DesktopKeyStore } from '../state/DesktopKeyStore.js';

export class DesktopProviderManager {
  private cache: { fingerprint: string; at: number; models: readonly ModelInfo[] } | null = null;
  private readonly providers = new Map<string, { fingerprint: string; provider: LlmProvider }>();
  constructor(
    private readonly store: DesktopStore,
    private readonly keys: DesktopKeyStore,
  ) {}
  async models(cancellation: CancellationToken, force = false) {
    const config = this.store.preferences.provider;
    const key = await this.keys.get(config);
    cancellation.throwIfCancellationRequested();
    const fingerprint = JSON.stringify([config, key]);
    if (!force && this.cache?.fingerprint === fingerprint && Date.now() - this.cache.at < 60_000)
      return this.cache.models;
    const models = await discoverProviderModels(config, key, cancellation);
    cancellation.throwIfCancellationRequested();
    this.cache = { fingerprint, at: Date.now(), models };
    return models;
  }
  async forConversation(id: string): Promise<LlmProvider> {
    const config = this.store.preferences.provider;
    const key = await this.keys.get(config);
    const fingerprint = JSON.stringify([config, key]);
    const cached = this.providers.get(id);
    if (cached?.fingerprint === fingerprint) {
      this.providers.delete(id);
      this.providers.set(id, cached);
      return cached.provider;
    }
    const provider = createLlmProvider(config, key);
    this.providers.delete(id);
    this.providers.set(id, { fingerprint, provider });
    while (this.providers.size > 8) this.providers.delete(this.providers.keys().next().value!);
    return provider;
  }
  clear(): void {
    this.cache = null;
    this.providers.clear();
  }
}
