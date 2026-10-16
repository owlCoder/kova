import { createLlmProvider } from '../../../runtime/src/providers/createLlmProvider.js';
import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { LlmProvider } from '../../../core/src/providers/LlmProvider.js';
import { ProviderApiKeyStore } from './ProviderApiKeyStore.js';
import type { ProviderKind } from '../../../runtime/src/providers/ProviderKind.js';
import type { ProviderConfiguration } from '../../../runtime/src/providers/ProviderConfiguration.js';
import { discoverProviderModels } from '../../../runtime/src/providers/discoverProviderModels.js';

export class ProviderManager {
  private readonly cache = new Map<string, { fingerprint: string; provider: LlmProvider }>();

  private discoveryCache: {
    key: string;
    expires: number;
    models: Awaited<ReturnType<typeof discoverProviderModels>>;
    defaultModelId: string;
    fingerprint: string;
  } | null = null;

  constructor(private readonly apiKeys: ProviderApiKeyStore) {}

  configuration(): ProviderConfiguration {
    const config = vscode.workspace.getConfiguration('kova');
    const kind = this.kind();
    const defaults = {
      ollama: 'http://127.0.0.1:11434',
      deepseek: 'https://api.deepseek.com',
      openaiCompatible: 'http://127.0.0.1:8000/v1',
    };
    return {
      kind,
      label: this.label(),
      baseUrl: config.get(`${kind}.baseUrl`, defaults[kind]),
      model: this.defaultModelId(),
      supportsTools:
        kind !== 'openaiCompatible' || config.get('openaiCompatible.supportsTools', true),
      discoverModels:
        kind !== 'openaiCompatible' || config.get('openaiCompatible.discoverModels', true),
    };
  }

  kind(): ProviderKind {
    const value = vscode.workspace.getConfiguration('kova').get<string>('provider', 'ollama');
    return value === 'deepseek' || value === 'openaiCompatible' ? value : 'ollama';
  }

  label(): string {
    return {
      ollama: 'Ollama',
      deepseek: 'DeepSeek',
      openaiCompatible: vscode.workspace
        .getConfiguration('kova')
        .get('openaiCompatible.name', 'OpenAI-compatible provider'),
    }[this.kind()];
  }

  defaultModelId(): string {
    const config = vscode.workspace.getConfiguration('kova');
    switch (this.kind()) {
      case 'deepseek':
        return config.get('deepseek.model', 'deepseek-flash');
      case 'openaiCompatible':
        return config.get('openaiCompatible.model', '');
      default:
        return config.get('ollama.model', 'qwen3:4b');
    }
  }

  thinkingEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('kova');
    switch (this.kind()) {
      case 'deepseek':
        return config.get('deepseek.think', false);
      case 'openaiCompatible':
        return false;
      default:
        return config.get('ollama.think', false);
    }
  }

  async discover(cancellation: CancellationToken, force = false) {
    cancellation.throwIfCancellationRequested();
    const config = this.configuration();
    const apiKey = await this.apiKeys.get(config.kind, config.baseUrl);
    cancellation.throwIfCancellationRequested();
    const fingerprint = this.fingerprint(apiKey, config);
    const key = JSON.stringify([config, fingerprint]);
    if (!force && this.discoveryCache?.key === key && this.discoveryCache.expires > Date.now())
      return this.discoveryCache;
    const models = await discoverProviderModels(config, apiKey, cancellation);
    cancellation.throwIfCancellationRequested();
    const result = { models, defaultModelId: config.model || models[0]?.id || '', fingerprint };
    // A configuration change during discovery must never populate the new configuration's cache.
    if (JSON.stringify(this.configuration()) === JSON.stringify(config))
      this.discoveryCache = { ...result, key, expires: Date.now() + 60_000 };
    return result;
  }

  async forConversation(conversationId: string): Promise<LlmProvider> {
    const configuration = this.configuration();
    const apiKey = await this.apiKeys.get(configuration.kind, configuration.baseUrl);
    const fingerprint = this.fingerprint(apiKey, configuration);
    const cached = this.cache.get(conversationId);
    if (cached?.fingerprint === fingerprint) return cached.provider;

    const provider = createLlmProvider(configuration, apiKey);
    this.cache.set(conversationId, { fingerprint, provider });
    return provider;
  }

  forgetConversation(conversationId: string): void {
    this.cache.delete(conversationId);
  }

  clear(): void {
    this.cache.clear();
    this.discoveryCache = null;
  }

  private fingerprint(apiKey: string | undefined, configuration: ProviderConfiguration): string {
    const config = vscode.workspace.getConfiguration('kova');
    const secretHash = apiKey
      ? createHash('sha256').update(apiKey).digest('hex').slice(0, 16)
      : 'none';
    return JSON.stringify([
      configuration,
      this.thinkingEnabled(),
      config.get('ollama.keepAliveSeconds', 300),
      secretHash,
    ]);
  }
}
