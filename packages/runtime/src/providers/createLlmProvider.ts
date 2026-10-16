import { OllamaConnection } from '../../../ollama/src/OllamaConnection.js';
import { OllamaLlmProvider } from '../../../ollama/src/OllamaLlmProvider.js';
import { OpenAiCompatibleConnection } from './OpenAiCompatibleConnection.js';
import { OpenAiCompatibleLlmProvider } from './OpenAiCompatibleLlmProvider.js';
import type { ProviderConfiguration } from './ProviderConfiguration.js';

export function createLlmProvider(config: ProviderConfiguration, apiKey: string | undefined) {
  if (config.kind === 'ollama') return new OllamaLlmProvider(new OllamaConnection(config.baseUrl));
  if (config.kind === 'deepseek' && !apiKey)
    throw new Error('Configure a DeepSeek API key in provider settings.');
  return new OpenAiCompatibleLlmProvider(
    new OpenAiCompatibleConnection(config.baseUrl, apiKey),
    config.kind === 'deepseek'
      ? 'deepseek'
      : new URL(config.baseUrl).hostname === 'api.openai.com'
        ? 'openai'
        : 'standard',
  );
}
