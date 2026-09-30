import type { RiskLevel } from './RiskLevel.js';
import type { ToolCall } from '../tools/ToolCall.js';
import type { ToolPreview } from '../tools/ToolPreview.js';

export interface ApprovalRequest {
  readonly approvalId: string;
  readonly runId: string;
  readonly call: ToolCall;
  readonly risk: RiskLevel;
  readonly reasons: readonly string[];
  readonly preview: ToolPreview | null;
  readonly preparationKey: string;
}

export type ApprovalResponse = {
  readonly approvalId: string;
  readonly preparationKey: string;
  readonly decision: 'AllowOnce' | 'Reject';
};
