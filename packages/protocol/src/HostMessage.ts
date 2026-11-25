import type { PresentationEvent } from './PresentationEvent.js';
import type { SessionSnapshot } from './SessionSnapshot.js';
import type { ContextPreview } from './ContextAttachmentView.js';
import type { KovaSettingsView } from './KovaSettingsView.js';
import type { PromptLibrary } from './PromptLibrary.js';

export type HostMessage = {
  readonly protocolVersion: 1;
  readonly hostSessionId: string;
  readonly sequence: number;
  readonly workspaceId: string | null;
} & (
  | { readonly type: 'PromptLibrary'; readonly requestId: string; readonly library: PromptLibrary }
  | { readonly type: 'Settings'; readonly requestId: string; readonly settings: KovaSettingsView }
  | { readonly type: 'OpenSettings' }
  | { readonly type: 'Compacted'; readonly conversationId: string }
  | { readonly type: 'ClipboardCopied'; readonly requestId: string }
  | {
      readonly type: 'ContextPreview';
      readonly requestId: string;
      readonly preview: ContextPreview;
    }
  | { readonly type: 'Notice'; readonly message: string }
  | { readonly type: 'Snapshot'; readonly requestId: string; readonly snapshot: SessionSnapshot }
  | { readonly type: 'Event'; readonly runId: string | null; readonly event: PresentationEvent }
  | { readonly type: 'Accepted'; readonly requestId: string; readonly runId: string | null }
  | {
      readonly type: 'Rejected';
      readonly requestId: string;
      readonly code: string;
      readonly message: string;
    }
);
