import { CancellationSource } from '../../../core/src/common/CancellationSource.js';
import type { ModelInfo } from '../../../core/src/models/ModelInfo.js';
import type { ProviderManager } from '../providers/ProviderManager.js';

export type ProviderStatus = 'Available' | 'Unavailable' | 'ModelMissing';

/** Owns model discovery state: discovered models, selection, fingerprint and status. */
export class ModelDiscovery {
  models: readonly ModelInfo[] = [];
  selectedModel = '';
  status: ProviderStatus = 'Unavailable';
  private fingerprint = '';
  private source: CancellationSource | null = null;
  constructor(
    private readonly providers: ProviderManager,
    private readonly onUnavailable: (message: string) => void,
    private readonly disposed: () => boolean,
  ) {}
  cancel(): void {
    this.source?.cancel();
  }
  async refresh(force: boolean): Promise<void> {
    if (this.disposed()) return;
    this.source?.cancel();
    const source = new CancellationSource();
    this.source = source;
    try {
      const discovered = await this.providers.discover(source, force);
      if (this.disposed() || this.source !== source || source.isCancellationRequested) return;
      const changedProvider = this.fingerprint !== discovered.fingerprint;
      this.fingerprint = discovered.fingerprint;
      this.models = discovered.models;
      if (!this.selectedModel || changedProvider) this.selectedModel = discovered.defaultModelId;
      this.status = this.models.some((model) => model.id === this.selectedModel)
        ? 'Available'
        : 'ModelMissing';
    } catch (error) {
      if (!source.isCancellationRequested) {
        this.models = [];
        this.status = 'Unavailable';
        this.onUnavailable(
          `${this.providers.label()} is unavailable. ${
            error instanceof Error ? error.message : 'Check provider configuration.'
          }`,
        );
      }
    }
  }
}
