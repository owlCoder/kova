import type { ProviderSettings } from './DesktopState.js';

export type ProviderDraft = Omit<ProviderSettings, 'hasApiKey'> & {
  readonly apiKey: string;
  readonly keyAction: 'keep' | 'replace' | 'remove';
  readonly rememberKey: boolean;
};

/** Desktop-only user intents, validated and scoped by the main process. */
export type DesktopMessage =
  | { readonly type: 'OpenWorkspace' }
  | { readonly type: 'SelectWorkspace'; readonly path: string }
  | { readonly type: 'SelectConversation'; readonly conversationId: string }
  | { readonly type: 'RenameConversation'; readonly conversationId: string; readonly title: string }
  | { readonly type: 'ArchiveConversation'; readonly conversationId: string }
  | { readonly type: 'ListWorkspaceFiles'; readonly path: string }
  | { readonly type: 'SearchWorkspaceFiles'; readonly query: string }
  | { readonly type: 'OpenWorkspaceFile'; readonly path: string }
  | { readonly type: 'WorkspaceDiff' }
  | { readonly type: 'OpenDataDirectory' }
  | { readonly type: 'TestProvider'; readonly draft: ProviderDraft }
  | { readonly type: 'SaveProvider'; readonly draft: ProviderDraft }
  | { readonly type: 'SetTheme'; readonly theme: 'dark' | 'light' | 'system' }
  | { readonly type: 'SetLanguage'; readonly language: 'en' | 'sr' | 'de' }
  | { readonly type: 'SetTextSize'; readonly textSize: 'standard' | 'large' | 'larger' }
  | { readonly type: 'WindowAction'; readonly action: 'sync' | 'maximize' }
  | { readonly type: 'OpenTerminal'; readonly cols: number; readonly rows: number }
  | { readonly type: 'TerminalInput'; readonly terminalId: string; readonly data: string }
  | {
      readonly type: 'ResizeTerminal';
      readonly terminalId: string;
      readonly cols: number;
      readonly rows: number;
    }
  | { readonly type: 'TerminalAck'; readonly terminalId: string; readonly characters: number }
  | { readonly type: 'CloseTerminal'; readonly terminalId: string };
