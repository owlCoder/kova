import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { LlmProvider } from '../../../core/src/providers/LlmProvider.js';
import { OllamaConnection } from '../../../ollama/src/OllamaConnection.js';
import { OllamaLlmProvider } from '../../../ollama/src/OllamaLlmProvider.js';
import { OllamaModelCatalog } from '../../../ollama/src/OllamaModelCatalog.js';
import { OpenAiCompatibleConnection } from './OpenAiCompatibleConnection.js';
import { OpenAiCompatibleLlmProvider } from './OpenAiCompatibleLlmProvider.js';
import { OpenAiCompatibleModelCatalog } from './OpenAiCompatibleModelCatalog.js';
import { ProviderApiKeyStore } from './ProviderApiKeyStore.js';
import type { ProviderKind } from './ProviderKind.js';

export class ProviderManager {
  private readonly cache = new Map<string, { fingerprint: string; provider: LlmProvider }>();

  constructor(private readonly apiKeys: ProviderApiKeyStore) {}

  kind(): ProviderKind {
    const value = vscode.workspace.getConfiguration('kova').get<string>('provider', 'ollama');
    return value === 'deepseek' || value === 'openaiCompatible' ? value : 'ollama';
  }

  label(): string {
    return {
      ollama: 'Ollama',
      deepseek: 'DeepSeek',
      openaiCompatible: 'OpenAI-compatible provider',
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

  async discover(cancellation: CancellationToken) {
    const config = vscode.workspace.getConfiguration('kova');
    const kind = this.kind();
    if (kind === 'ollama') {
      const catalog = new OllamaModelCatalog(
        new OllamaConnection(config.get('ollama.baseUrl', 'http://127.0.0.1:11434'), fetch, 15_000),
      );
      const models = await catalog.listAvailable(cancellation);
      return {
        models,
        defaultModelId: config.get('ollama.model', 'qwen3:4b'),
        fingerprint: await this.fingerprint(),
      };
    }

    const apiKey = await this.apiKeys.get(kind);
    if (kind === 'deepseek' && !apiKey)
      throw new Error('API key is not configured. Run “Kova: Set Provider API Key”.');
    const baseUrl =
      kind === 'deepseek'
        ? config.get('deepseek.baseUrl', 'https://api.deepseek.com')
        : config.get('openaiCompatible.baseUrl', 'http://127.0.0.1:8000/v1');
    const tools =
      kind === 'deepseek' || config.get('openaiCompatible.supportsTools', true)
        ? 'Supported'
        : 'Unsupported';
    const thinking = kind === 'deepseek' ? 'Supported' : 'Unsupported';
    const catalog = new OpenAiCompatibleModelCatalog(
      new OpenAiCompatibleConnection(baseUrl, apiKey, fetch, 15_000),
      tools,
      thinking,
    );
    const models = await catalog.listAvailable(cancellation);
    const configured =
      kind === 'deepseek'
        ? config.get('deepseek.model', 'deepseek-flash')
        : config.get('openaiCompatible.model', '');
    return {
      models,
      defaultModelId: configured || models[0]?.id || '',
      fingerprint: await this.fingerprint(),
    };
  }

  async forConversation(conversationId: string): Promise<LlmProvider> {
    const fingerprint = await this.fingerprint();
    const cached = this.cache.get(conversationId);
    if (cached?.fingerprint === fingerprint) return cached.provider;

    const config = vscode.workspace.getConfiguration('kova');
    const kind = this.kind();
    let provider: LlmProvider;
    if (kind === 'ollama') {
      provider = new OllamaLlmProvider(
        new OllamaConnection(config.get('ollama.baseUrl', 'http://127.0.0.1:11434')),
      );
    } else {
      const apiKey = await this.apiKeys.get(kind);
      if (kind === 'deepseek' && !apiKey)
        throw new Error('API key is not configured. Run “Kova: Set Provider API Key”.');
      const baseUrl =
        kind === 'deepseek'
          ? config.get('deepseek.baseUrl', 'https://api.deepseek.com')
          : config.get('openaiCompatible.baseUrl', 'http://127.0.0.1:8000/v1');
      provider = new OpenAiCompatibleLlmProvider(
        new OpenAiCompatibleConnection(baseUrl, apiKey),
        kind === 'deepseek' ? 'deepseek' : 'standard',
      );
    }
    this.cache.set(conversationId, { fingerprint, provider });
    return provider;
  }

  forgetConversation(conversationId: string): void {
    this.cache.delete(conversationId);
  }

  clear(): void {
    this.cache.clear();
  }

  private async fingerprint(): Promise<string> {
    const config = vscode.workspace.getConfiguration('kova');
    const kind = this.kind();
    const apiKey = await this.apiKeys.get(kind);
    const secretHash = apiKey
      ? createHash('sha256').update(apiKey).digest('hex').slice(0, 16)
      : 'none';
    switch (kind) {
      case 'deepseek':
        return [
          kind,
          config.get('deepseek.baseUrl', 'https://api.deepseek.com'),
          config.get('deepseek.think', false),
          secretHash,
        ].join('|');
      case 'openaiCompatible':
        return [
          kind,
          config.get('openaiCompatible.baseUrl', 'http://127.0.0.1:8000/v1'),
          config.get('openaiCompatible.supportsTools', true),
          secretHash,
        ].join('|');
      default:
        return [
          kind,
          config.get('ollama.baseUrl', 'http://127.0.0.1:11434'),
          config.get('ollama.keepAliveSeconds', 300),
        ].join('|');
    }
  }
}
