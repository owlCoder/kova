import type { CancellationToken } from '../../core/src/common/CancellationToken.js';
import type { ModelCatalog } from '../../core/src/models/ModelCatalog.js';
import type { ModelInfo, CapabilitySupport } from '../../core/src/models/ModelInfo.js';
import { OllamaConnection } from './OllamaConnection.js';

export class OllamaModelCatalog implements ModelCatalog {
  constructor(private readonly connection: OllamaConnection) {}

  async listInstalled(cancellation: CancellationToken): Promise<readonly ModelInfo[]> {
    return this.listAvailable(cancellation);
  }

  async listAvailable(cancellation: CancellationToken): Promise<readonly ModelInfo[]> {
    const raw = await this.connection.json('/api/tags', null, cancellation);
    if (!raw || typeof raw !== 'object' || !('models' in raw) || !Array.isArray(raw.models))
      throw new Error('Invalid Ollama model list.');
    const items = raw.models.slice(0, 100);
    const models: (ModelInfo | null)[] = new Array(items.length).fill(null);
    let cursor = 0;
    const inspect = async (item: unknown): Promise<ModelInfo | null> => {
      cancellation.throwIfCancellationRequested();
      if (
        !item ||
        typeof item !== 'object' ||
        !('name' in item) ||
        typeof item.name !== 'string' ||
        !('size' in item) ||
        typeof item.size !== 'number'
      )
        return null;
      const record = item as Record<string, unknown>;
      let details: Record<string, unknown> = record;
      if (!Array.isArray(record.capabilities)) {
        try {
          const shown = await this.connection.json('/api/show', { model: item.name }, cancellation);
          if (shown && typeof shown === 'object') details = shown as Record<string, unknown>;
        } catch {
          cancellation.throwIfCancellationRequested();
        }
      }
      const support = (capability: string): CapabilitySupport =>
        Array.isArray(details.capabilities)
          ? details.capabilities.includes(capability)
            ? 'Supported'
            : 'Unsupported'
          : 'Unknown';
      const info =
        details.model_info && typeof details.model_info === 'object'
          ? (details.model_info as Record<string, unknown>)
          : {};
      const lengths = Object.entries(info)
        .filter(([key, value]) => key.endsWith('.context_length') && typeof value === 'number')
        .map(([, value]) => value as number);
      const itemDetails =
        record.details && typeof record.details === 'object'
          ? (record.details as Record<string, unknown>)
          : {};
      return {
        id: item.name,
        displayName: item.name,
        sizeBytes: item.size,
        tools: support('tools'),
        thinking: support('thinking'),
        maxContextTokens:
          lengths[0] ??
          (typeof itemDetails.context_length === 'number' ? itemDetails.context_length : null),
      };
    };
    // Bound metadata requests so large libraries do not serialize dozens of network round trips.
    await Promise.all(
      Array.from({ length: Math.min(4, items.length) }, async () => {
        while (cursor < items.length) {
          const index = cursor++;
          models[index] = await inspect(items[index]);
        }
      }),
    );
    cancellation.throwIfCancellationRequested();
    return models.filter((model): model is ModelInfo => model !== null);
  }
}
