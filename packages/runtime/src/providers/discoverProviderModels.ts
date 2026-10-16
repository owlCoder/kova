import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { ModelInfo } from '../../../core/src/models/ModelInfo.js';
import { OllamaConnection } from '../../../ollama/src/OllamaConnection.js';
import { OllamaModelCatalog } from '../../../ollama/src/OllamaModelCatalog.js';
import { OpenAiCompatibleConnection } from './OpenAiCompatibleConnection.js';
import { OpenAiCompatibleModelCatalog } from './OpenAiCompatibleModelCatalog.js';
import type { ProviderConfiguration } from './ProviderConfiguration.js';

export async function discoverProviderModels(
  config: ProviderConfiguration,
  apiKey: string | undefined,
  cancellation: CancellationToken,
): Promise<readonly ModelInfo[]> {
  cancellation.throwIfCancellationRequested();
  if (config.kind === 'ollama')
    return new OllamaModelCatalog(
      new OllamaConnection(config.baseUrl, fetch, 15_000),
    ).listAvailable(cancellation);
  if (config.kind === 'deepseek' && !apiKey)
    throw new Error('API key is not configured. Run “Kova: Set Provider API Key”.');
  const connection = new OpenAiCompatibleConnection(config.baseUrl, apiKey, fetch, 15_000);
  const tools = config.supportsTools ? 'Supported' : 'Unsupported';
  const thinking = config.kind === 'deepseek' ? 'Supported' : 'Unsupported';
  if (!config.discoverModels) {
    if (!config.model.trim()) throw new Error('Enter a model ID or enable model discovery.');
    return [
      {
        id: config.model,
        displayName: config.model,
        sizeBytes: null,
        tools,
        thinking,
        maxContextTokens: null,
      },
    ];
  }
  return new OpenAiCompatibleModelCatalog(connection, tools, thinking).listAvailable(cancellation);
}
