import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { CapabilitySupport, ModelInfo } from '../../../core/src/models/ModelInfo.js';
import { OpenAiCompatibleConnection } from './OpenAiCompatibleConnection.js';

export class OpenAiCompatibleModelCatalog {
  constructor(
    private readonly connection: OpenAiCompatibleConnection,
    private readonly tools: CapabilitySupport,
    private readonly thinking: CapabilitySupport,
  ) {}

  async listAvailable(cancellation: CancellationToken): Promise<readonly ModelInfo[]> {
    const raw = await this.connection.json('/models', null, cancellation);
    if (!raw || typeof raw !== 'object' || !('data' in raw) || !Array.isArray(raw.data))
      throw new Error('Invalid provider model list.');
    return raw.data.slice(0, 200).flatMap((item): ModelInfo[] => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      if (typeof record.id !== 'string') return [];
      return [
        {
          id: record.id,
          displayName: typeof record.name === 'string' ? record.name : record.id,
          sizeBytes: null,
          tools: this.tools,
          thinking: this.thinking,
          maxContextTokens:
            typeof record.context_window === 'number' && record.context_window > 0
              ? record.context_window
              : null,
        },
      ];
    });
  }
}
