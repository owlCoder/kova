import type { ProviderSettings } from './DesktopState.js';

export type ProviderDraft = Omit<ProviderSettings, 'hasApiKey'> & {
  readonly apiKey: string;
  readonly keyAction: 'keep' | 'replace' | 'remove';
  readonly rememberKey: boolean;
};

/** Desktop-only user intents. No filesystem or process primitive crosses the bridge. */
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
  | { readonly type: 'TestProvider'; readonly draft: ProviderDraft }
  | { readonly type: 'SaveProvider'; readonly draft: ProviderDraft }
  | { readonly type: 'SetTheme'; readonly theme: 'dark' | 'light' | 'system' };
