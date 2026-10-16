import * as vscode from 'vscode';
import { CancellationSource } from '../../../core/src/common/CancellationSource.js';
import type { ModelInfo } from '../../../core/src/models/ModelInfo.js';
import { ProviderApiKeyStore } from './ProviderApiKeyStore.js';
import type { ProviderConfiguration } from '../../../runtime/src/providers/ProviderConfiguration.js';
import { ProviderManager } from './ProviderManager.js';
import { discoverProviderModels } from '../../../runtime/src/providers/discoverProviderModels.js';
import { providerPresets } from '../../../runtime/src/providers/providerPresets.js';

export function validateEndpoint(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return 'Use an HTTP(S) base URL without credentials, query parameters or fragments.';
  } catch {
    return 'Enter a valid HTTP(S) base URL.';
  }
  if (value.length > 2048) return 'Endpoint is too long.';
  return undefined;
}

/** Native input boxes keep credentials out of webview messages and snapshots. */
export class ProviderSetupWizard {
  constructor(
    private readonly providers: ProviderManager,
    private readonly apiKeys: ProviderApiKeyStore,
  ) {}

  async run(): Promise<boolean> {
    const current = this.providers.configuration();
    const preset = await vscode.window.showQuickPick(
      providerPresets.map((config) => ({
        label: config.label,
        description: config.description,
        config,
        picked: config.kind === current.kind && config.baseUrl === current.baseUrl,
      })),
      {
        title: 'Kova setup · 1/4 · Choose your AI provider',
        ignoreFocusOut: true,
        placeHolder: 'Use a local model or connect a cloud API',
      },
    );
    if (!preset) return false;
    const sameProvider =
      preset.config.kind === current.kind &&
      (current.kind !== 'openaiCompatible' ||
        preset.config.baseUrl === current.baseUrl ||
        preset.config.label === 'Custom provider');
    let config: ProviderConfiguration = sameProvider
      ? { ...current, label: preset.config.label }
      : preset.config;
    const endpoint = await vscode.window.showInputBox({
      title: 'Kova setup · 2/4 · Provider endpoint',
      ignoreFocusOut: true,
      prompt:
        config.kind === 'ollama'
          ? 'Start Ollama before continuing.'
          : 'Base URL; Kova appends /models and /chat/completions.',
      value: config.baseUrl,
      validateInput: validateEndpoint,
    });
    if (endpoint === undefined) return false;
    if (validateEndpoint(endpoint.trim())) throw new Error('Invalid provider endpoint.');
    config = { ...config, baseUrl: endpoint.trim().replace(/\/+$/, '') };
    let apiKey: string | undefined;
    if (config.kind !== 'ollama') {
      const existing =
        config.kind === current.kind && config.baseUrl === current.baseUrl
          ? await this.apiKeys.get(config.kind, config.baseUrl)
          : undefined;
      const value = await vscode.window.showInputBox({
        title: 'Kova setup · 3/4 · API key',
        password: true,
        ignoreFocusOut: true,
        prompt: existing
          ? 'Leave blank to keep the stored key for this endpoint.'
          : 'Stored securely in VS Code. Leave blank for an endpoint without authentication.',
        validateInput: (value) =>
          config.kind === 'deepseek' && !value.trim() && !existing
            ? 'DeepSeek requires an API key.'
            : undefined,
      });
      if (value === undefined) return false;
      apiKey = value.trim() || existing;
    }
    if (config.kind === 'openaiCompatible') {
      const source = await vscode.window.showQuickPick(
        [
          {
            label: 'Discover models',
            description: 'Check the connection using GET /models',
            discover: true,
          },
          {
            label: 'Enter model ID manually',
            description: 'For endpoints without a model list; connection checked on first prompt',
            discover: false,
          },
        ],
        { title: 'Kova setup · 4/4 · Model', ignoreFocusOut: true },
      );
      if (!source) return false;
      config = { ...config, discoverModels: source.discover };
    }
    if (config.discoverModels) {
      let cancelled = false;
      let models: readonly ModelInfo[];
      try {
        models = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Kova: Checking ${config.label} connection…`,
            cancellable: true,
          },
          async (_, token) => {
            const source = new CancellationSource();
            const subscription = token.onCancellationRequested(() => source.cancel());
            if (token.isCancellationRequested) source.cancel();
            try {
              return await discoverProviderModels(config, apiKey, source);
            } finally {
              cancelled = source.isCancellationRequested;
              subscription.dispose();
            }
          },
        );
      } catch (error) {
        if (cancelled) return false;
        const status = error instanceof Error ? error.message.match(/HTTP \d{3}/)?.[0] : undefined;
        const action = await vscode.window.showWarningMessage(
          `Could not load ${config.label} models${status ? ` (${status})` : ''}. Check the endpoint, key and server.${config.kind === 'ollama' ? ` Start Ollama and run “ollama pull ${config.model || 'qwen3:4b'}”.` : ''}`,
          ...(config.kind === 'openaiCompatible' ? ['Enter model manually'] : []),
        );
        if (action !== 'Enter model manually') return false;
        config = { ...config, discoverModels: false };
        models = [];
      }
      if (config.discoverModels) {
        if (!models.length) {
          await vscode.window.showWarningMessage(
            'No models found. Install or enable a chat model, then run Kova setup again.',
          );
          return false;
        }
        const model = await vscode.window.showQuickPick(
          models.map((model) => ({
            label: model.displayName,
            description: model.id,
            model,
            picked: model.id === config.model,
          })),
          {
            title: 'Kova setup · Choose a chat model',
            ignoreFocusOut: true,
            placeHolder: 'Connection checked · choose a model that supports chat completions',
          },
        );
        if (!model) return false;
        config = { ...config, model: model.model.id };
      }
    }
    if (!config.discoverModels) {
      const model = await vscode.window.showInputBox({
        title: 'Kova setup · Model ID',
        value: config.model,
        ignoreFocusOut: true,
        prompt:
          'Use the exact model ID from your provider. Connection will be checked on your first prompt.',
        validateInput: (value) =>
          !value.trim() || value.trim().length > 256
            ? 'Enter a model ID (up to 256 characters).'
            : undefined,
      });
      if (model === undefined) return false;
      config = { ...config, model: model.trim() };
    }
    if (config.kind === 'openaiCompatible') {
      const tools = await vscode.window.showQuickPick(
        [
          {
            label: 'Enable tools',
            description: 'The selected model supports function calling',
            enabled: true,
          },
          {
            label: 'Chat only',
            description: 'Use a model without function calling',
            enabled: false,
          },
        ],
        { title: 'Kova setup · Model capabilities', ignoreFocusOut: true },
      );
      if (!tools) return false;
      config = { ...config, supportsTools: tools.enabled };
    }
    const settings = vscode.workspace.getConfiguration('kova');
    const updates: [string, unknown][] = [
      [`${config.kind}.baseUrl`, config.baseUrl],
      [`${config.kind}.model`, config.model],
      ...(config.kind === 'openaiCompatible'
        ? ([
            ['openaiCompatible.name', config.label],
            ['openaiCompatible.supportsTools', config.supportsTools],
            ['openaiCompatible.discoverModels', config.discoverModels],
          ] as [string, unknown][])
        : []),
      ['provider', config.kind],
    ];
    const target = updates.some(([key]) => settings.inspect(key)?.workspaceValue !== undefined)
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    const confirm = await vscode.window.showQuickPick(
      [
        {
          label: 'Save and use provider',
          description: `${config.label} · ${config.model}`,
          detail: `${config.baseUrl} · ${target === vscode.ConfigurationTarget.Global ? 'User' : 'Workspace'} settings${config.discoverModels ? ' · model list checked' : ' · manual model (connection not checked)'}`,
        },
      ],
      { title: 'Kova setup · Review configuration', ignoreFocusOut: true },
    );
    if (!confirm) return false;
    // Do not mutate settings or stored credentials until every step has been accepted.
    if (config.kind !== 'ollama') {
      if (apiKey) await this.apiKeys.set(config.kind, apiKey, config.baseUrl);
      else await this.apiKeys.delete(config.kind, config.baseUrl);
    }
    for (const [key, value] of updates) await settings.update(key, value, target);
    this.providers.clear();
    return true;
  }
}
