export interface ProviderSettings {
  readonly kind: 'ollama' | 'deepseek' | 'openaiCompatible';
  readonly label: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly supportsTools: boolean;
  readonly discoverModels: boolean;
  readonly thinking: boolean;
  readonly hasApiKey: boolean;
}

export interface DesktopState {
  readonly appVersion: string;
  readonly providerPresets: readonly (Omit<ProviderSettings, 'thinking' | 'hasApiKey'> & {
    readonly description: string;
  })[];
  readonly workspacePath: string | null;
  readonly workspaceName: string;
  readonly recentWorkspaces: readonly string[];
  readonly sessions: readonly SessionSummary[];
  readonly archivedSessions: readonly SessionSummary[];
  readonly provider: ProviderSettings;
  readonly theme: 'dark' | 'light' | 'system';
  readonly platform: string;
  readonly language: 'en' | 'sr' | 'de';
  readonly textSize: 'standard' | 'large' | 'larger';
  readonly runtimeVersions: {
    readonly electron: string;
    readonly chrome: string;
    readonly node: string;
  };
}

export interface WorkspaceEntry {
  readonly name: string;
  readonly path: string;
  readonly kind: 'File' | 'Directory' | 'Symlink';
}

export interface FilePreview {
  readonly path: string;
  readonly content: string;
  readonly language: string;
}
import type { SessionSummary } from './SessionSummary.js';
