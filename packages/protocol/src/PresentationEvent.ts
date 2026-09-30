import type { AgentEvent } from '../../core/src/agents/AgentEvent.js';
import type { ApprovalView } from './ApprovalView.js';

/** Adapter projection avoids forwarding file-write payloads and full diff contents. */
export type PresentationEvent =
  | Exclude<AgentEvent, { readonly type: 'ToolRequested' | 'ToolAwaitingApproval' }>
  | {
      readonly type: 'ToolRequested';
      readonly callId: string;
      readonly toolName: string;
      readonly sourceLabel: string;
      readonly argumentSummary: string;
    }
  | { readonly type: 'ToolAwaitingApproval'; readonly request: ApprovalView };
