import type { ContextUsage } from '../context/ContextUsage.js';
import type { HookReport } from '../hooks/HookReport.js';
import type { PolicyDecision } from '../permissions/PolicyDecision.js';
import type { RiskLevel } from '../permissions/RiskLevel.js';
import type { ApprovalRequest } from '../permissions/ApprovalRequest.js';
import type { ToolCall } from '../tools/ToolCall.js';
import type { ToolResult } from '../tools/ToolResult.js';
import type { AgentState } from './AgentState.js';
import type { LoopStopReason } from './RunOutcome.js';

/** Events contain presentation-safe JSON data, never implementation objects. */
export type AgentEvent =
  | { readonly type: 'StateChanged'; readonly state: AgentState }
  | { readonly type: 'ResponseStarted'; readonly messageId: string }
  | { readonly type: 'ResponseDelta'; readonly messageId: string; readonly text: string }
  | { readonly type: 'ThinkingDelta'; readonly messageId: string; readonly text: string }
  | {
      readonly type: 'ResponseCompleted';
      readonly messageId: string;
      readonly finishReason: 'Complete' | 'ToolCalls' | 'Length';
    }
  | { readonly type: 'SkillLoaded'; readonly skillId: string; readonly name: string }
  | { readonly type: 'ToolRequested'; readonly call: ToolCall; readonly sourceLabel: string }
  | {
      readonly type: 'ToolValidationFailed';
      readonly callId: string;
      readonly code: string;
      readonly message: string;
      readonly repairAttempt: number;
    }
  | {
      readonly type: 'PolicyEvaluated';
      readonly callId: string;
      readonly risk: RiskLevel;
      readonly decision: PolicyDecision;
    }
  | { readonly type: 'HookObserved'; readonly callId: string; readonly report: HookReport }
  | {
      readonly type: 'GuardrailEvaluated';
      readonly callId: string;
      readonly decision: PolicyDecision;
    }
  | { readonly type: 'ToolAwaitingApproval'; readonly request: ApprovalRequest }
  | { readonly type: 'ToolStarted'; readonly callId: string }
  | { readonly type: 'ToolCompleted'; readonly callId: string; readonly result: ToolResult }
  | { readonly type: 'ToolBlocked'; readonly callId: string; readonly reasons: readonly string[] }
  | { readonly type: 'ToolDenied'; readonly callId: string }
  | {
      readonly type: 'McpServerStarted';
      readonly serverId: string;
      readonly command: string;
      readonly args: readonly string[];
    }
  | { readonly type: 'McpServerStopped'; readonly serverId: string; readonly reason: string }
  | {
      readonly type: 'McpToolCalled';
      readonly serverId: string;
      readonly callId: string;
      readonly toolName: string;
    }
  | { readonly type: 'ContextUpdated'; readonly usage: ContextUsage }
  | { readonly type: 'AgentLoopStopped'; readonly reason: LoopStopReason }
  | { readonly type: 'GenerationCancelled' }
  | {
      readonly type: 'ErrorOccurred';
      readonly code: string;
      readonly message: string;
      readonly recoverable: boolean;
    };
