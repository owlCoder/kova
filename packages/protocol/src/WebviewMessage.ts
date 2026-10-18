import type { AgentMode } from './AgentMode.js';
import type { DesktopMessage } from './DesktopMessage.js';

/** Untrusted UI intents; host validates shape, limits, IDs and current workspace/run. */
export type WebviewMessage = {
  readonly protocolVersion: 1;
  readonly requestId: string;
} & (
  | DesktopMessage
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
  | { readonly type: 'NewConversation' }
  | { readonly type: 'UpdateDraft'; readonly conversationId: string; readonly prompt: string }
  | {
      readonly type: 'ExportConversation';
      readonly conversationId: string;
      readonly action: 'save' | 'copy';
    }
  | { readonly type: 'SelectSkill'; readonly skillId: string | null }
  | { readonly type: 'AddContext'; readonly source: 'Selection' | 'CurrentFile' | 'PickFiles' }
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
  | { readonly type: 'OpenSettings' }
  | { readonly type: 'OpenProviderSetup' }
  | { readonly type: 'CompleteSetup' }
  | { readonly type: 'OpenExternal'; readonly url: string }
  | { readonly type: 'CopyText'; readonly text: string }
  | { readonly type: 'OpenSetupInstructions' }
);
