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
    const models: ModelInfo[] = [];
    for (const item of raw.models.slice(0, 100)) {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof item.name !== 'string' ||
        typeof item.size !== 'number'
      )
        continue;
      let details: Record<string, unknown> = item;
      if (!Array.isArray(item.capabilities)) {
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
        item.details && typeof item.details === 'object'
          ? (item.details as Record<string, unknown>)
          : {};
      models.push({
        id: item.name,
        displayName: item.name,
        sizeBytes: item.size,
        tools: support('tools'),
        thinking: support('thinking'),
        maxContextTokens:
          lengths[0] ??
          (typeof itemDetails.context_length === 'number' ? itemDetails.context_length : null),
      });
    }
    return models;
  }
}
