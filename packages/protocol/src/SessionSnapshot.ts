import type { AgentMode } from './AgentMode.js';
import type { AgentState } from './AgentState.js';
import type { ContextUsage } from './ContextUsage.js';
import type { ModelInfo } from './ModelInfo.js';
import type { SkillMetadata } from './SkillMetadata.js';
import type { ApprovalView } from './ApprovalView.js';

/** Presentation history is bounded and excludes model thinking. */
export interface SessionSnapshot {
  readonly conversationId: string;
  readonly activeRunId: string | null;
  readonly state: AgentState;
  readonly mode: AgentMode;
  readonly selectedModelId: string;
  readonly models: readonly ModelInfo[];
  readonly providerStatus: 'Available' | 'Unavailable' | 'ModelMissing';
  readonly toolsEnabled: boolean;
  readonly skills: readonly SkillMetadata[];
  readonly activeSkillId: string | null;
  readonly usage: ContextUsage | null;
  readonly messages: readonly {
    readonly id: string;
    readonly role: 'user' | 'assistant';
    readonly content: string;
    readonly partial: boolean;
  }[];
  readonly contextAttachments: readonly { readonly id: string; readonly label: string }[];
  readonly pendingApproval: ApprovalView | null;
  readonly thinkingEnabled: boolean;
  readonly contextMaxTokens: number;
}
