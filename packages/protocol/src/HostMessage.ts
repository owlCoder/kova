import type { PresentationEvent } from './PresentationEvent.js';
import type { SessionSnapshot } from './SessionSnapshot.js';
import type { FilePreview, WorkspaceEntry } from './DesktopState.js';
import type { ModelInfo } from './ModelInfo.js';

export type HostMessage = {
  readonly protocolVersion: 1;
  readonly hostSessionId: string;
  readonly sequence: number;
  readonly workspaceId: string | null;
} & (
  | {
      readonly type: 'WorkspaceSearchResults';
      readonly query: string;
      readonly entries: readonly WorkspaceEntry[];
      readonly truncated: boolean;
    }
  | {
      readonly type: 'WorkspaceFiles';
      readonly path: string;
      readonly entries: readonly WorkspaceEntry[];
    }
  | { readonly type: 'FilePreview'; readonly file: FilePreview }
  | {
      readonly type: 'DiffPreview';
      readonly title: string;
      readonly changes: readonly {
        readonly path: string;
        readonly before: string;
        readonly after: string;
      }[];
      readonly diff: string;
    }
  | {
      readonly type: 'ProviderModels';
      readonly requestId: string;
      readonly models: readonly ModelInfo[];
      readonly error: string | null;
    }
  | { readonly type: 'OpenPreferences' }
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
