import type { PresentationEvent } from './PresentationEvent.js';
import type { SessionSnapshot } from './SessionSnapshot.js';

export type HostMessage = {
  readonly protocolVersion: 1;
  readonly hostSessionId: string;
  readonly sequence: number;
  readonly workspaceId: string | null;
} & (
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
