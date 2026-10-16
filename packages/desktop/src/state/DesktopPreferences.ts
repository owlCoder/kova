import type { ProviderConfiguration } from '../../../runtime/src/providers/ProviderConfiguration.js';

export interface DesktopPreferences {
  readonly provider: ProviderConfiguration;
  readonly thinking: boolean;
  readonly contextMaxTokens: number;
  readonly theme: 'dark' | 'light' | 'system';
  readonly recentWorkspaces: readonly string[];
  readonly lastConversationId: string | null;
  readonly setupCompleted: boolean;
  readonly commandAllowlist: readonly string[];
}

export const defaultPreferences: DesktopPreferences = {
  provider: {
    kind: 'ollama',
    label: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434',
    model: 'qwen3:4b',
    supportsTools: true,
    discoverModels: true,
  },
  thinking: false,
  contextMaxTokens: 32768,
  theme: 'dark',
  recentWorkspaces: [],
  lastConversationId: null,
  setupCompleted: false,
  commandAllowlist: ['git status', 'git diff', 'git log', 'npm test'],
};
