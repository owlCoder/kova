import * as vscode from 'vscode';
import type { ModelInfo } from '../../../core/src/models/ModelInfo.js';
import type { ProviderManager } from '../providers/ProviderManager.js';

export function readRunSettings(providers: ProviderManager, model: ModelInfo) {
  const settings = vscode.workspace.getConfiguration('kova');
  const maxTokens = settings.get('context.maxTokens', 32768);
  if (model.maxContextTokens && maxTokens > model.maxContextTokens)
    throw new Error('Configured context exceeds the model context limit.');
  const thinkingEnabled = providers.thinkingEnabled();
  if (thinkingEnabled && model.thinking !== 'Supported')
    throw new Error(
      'This model does not report thinking support. Disable thinking in Kova settings.',
    );
  return {
    context: {
      maxTokens,
      reservedOutputTokens: settings.get('context.reservedOutputTokens', 4096),
      safetyMarginRatio: settings.get('context.safetyMarginRatio', 0.1),
      maxToolOutputCharacters: 8000,
    },
    thinkingEnabled,
    keepAliveSeconds:
      providers.kind() === 'ollama' ? settings.get('ollama.keepAliveSeconds', 300) : 0,
    commandAllowlist: settings.get<readonly string[]>('commands.allow', []),
  };
}
