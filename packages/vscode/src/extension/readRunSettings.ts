import * as vscode from 'vscode';
import type { ModelInfo } from '../../../core/src/models/ModelInfo.js';
import type { ProviderManager } from '../providers/ProviderManager.js';
import { configuredContext } from './effectiveContext.js';

export function readRunSettings(providers: ProviderManager, model: ModelInfo) {
  const settings = vscode.workspace.getConfiguration('kova');
  const budget = configuredContext(settings, model, providers.kind());
  const thinkingEnabled = providers.thinkingEnabled();
  if (thinkingEnabled && model.thinking !== 'Supported')
    throw new Error(
      'This model does not report thinking support. Disable thinking in Kova settings.',
    );
  return {
    context: {
      maxTokens: budget.maxTokens,
      reservedOutputTokens: budget.reservedOutputTokens,
      safetyMarginRatio: settings.get('context.safetyMarginRatio', 0.1),
      maxToolOutputCharacters: 8000,
    },
    thinkingEnabled,
    keepAliveSeconds:
      providers.kind() === 'ollama' ? settings.get('ollama.keepAliveSeconds', 300) : 0,
    commandAllowlist: settings.get<readonly string[]>('commands.allow', []),
  };
}
