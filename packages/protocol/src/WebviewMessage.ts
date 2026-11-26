import type { AgentMode } from './AgentMode.js';
import type { KovaSettingsView } from './KovaSettingsView.js';
import type { PromptLibraryMessage } from './PromptLibrary.js';

/** Untrusted UI intents; host validates shape, limits, IDs and current workspace/run. */
export type WebviewMessage = {
  readonly protocolVersion: 1;
  readonly requestId: string;
} & (
  | PromptLibraryMessage
  | { readonly type: 'Ready' }
  | {
      readonly type: 'SubmitPrompt';
      readonly prompt: string;
      readonly modelId: string;
      readonly mode: AgentMode;
      readonly skillId: string | null;
      readonly attachmentIds: readonly string[];
    }
  | { readonly type: 'CancelRun'; readonly runId: string }
  | { readonly type: 'RevertRun'; readonly runId: string }
  | { readonly type: 'NewConversation' }
  | { readonly type: 'CompactConversation' }
  | { readonly type: 'OpenConversation'; readonly conversationId: string }
  | { readonly type: 'RenameConversation'; readonly conversationId: string; readonly title: string }
  | { readonly type: 'ImportConversation'; readonly markdown: string }
  | { readonly type: 'UpdateDraft'; readonly conversationId: string; readonly prompt: string }
  | {
      readonly type: 'ExportConversation';
      readonly conversationId: string;
      readonly action: 'save' | 'copy';
    }
  | { readonly type: 'SelectSkill'; readonly skillId: string | null }
  | { readonly type: 'AddContext'; readonly source: 'Selection' | 'CurrentFile' | 'PickFiles' }
  | { readonly type: 'AttachPath'; readonly path: string }
  | {
      readonly type: 'AttachImage';
      readonly name: string;
      readonly mimeType: string;
      readonly dataUrl: string;
    }
  | { readonly type: 'ListWorkspaceFiles'; readonly query: string }
  | { readonly type: 'RemoveContext'; readonly attachmentId: string }
  | {
      readonly type: 'PreviewContext';
      readonly conversationId: string;
      readonly attachmentId: string;
    }
  | {
      readonly type: 'ResolveApproval';
      readonly runId: string;
      readonly approvalId: string;
      readonly preparationKey: string;
      readonly decision: 'AllowOnce' | 'Reject';
    }
  | { readonly type: 'OpenDiffPreview'; readonly approvalId: string }
  | { readonly type: 'RetryProvider' }
  | { readonly type: 'GetSettings' }
  | { readonly type: 'UpdateSettings'; readonly values: KovaSettingsView }
  | { readonly type: 'OpenSettings' }
  | { readonly type: 'OpenProviderSetup' }
  | { readonly type: 'CompleteSetup' }
  | { readonly type: 'OpenExternal'; readonly url: string }
  | { readonly type: 'CopyText'; readonly text: string }
  | { readonly type: 'OpenSetupInstructions' }
);
