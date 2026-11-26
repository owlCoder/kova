import type { AgentMode } from './AgentMode.js';
import type { AgentState } from './AgentState.js';
import type { ContextUsage } from './ContextUsage.js';
import type { ModelInfo } from './ModelInfo.js';
import type { SkillMetadata } from './SkillMetadata.js';
import type { ApprovalView } from './ApprovalView.js';
import type { ContextAttachmentView } from './ContextAttachmentView.js';

/** Presentation history is bounded and excludes model thinking. */
export interface SessionSnapshot {
  readonly language?: 'en' | 'sr' | 'de';
  readonly textSize?: 'standard' | 'large' | 'larger';
  readonly conversationId: string;
  readonly draft?: string;
  readonly activeRunId: string | null;
  readonly state: AgentState;
  readonly mode: AgentMode;
  readonly selectedModelId: string;
  readonly models: readonly ModelInfo[];
  readonly providerStatus: 'Available' | 'Unavailable' | 'ModelMissing';
  readonly providerLabel: string;
  readonly setupCompleted: boolean;
  readonly configuringProvider: boolean;
  readonly toolsEnabled: boolean;
  /** All open workspace folders; the active one arrives via the message envelope. */
  readonly workspaceFolders: readonly string[];
  readonly skills: readonly SkillMetadata[];
  readonly activeSkillId: string | null;
  readonly usage: ContextUsage | null;
  readonly usageTotals: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly runs: number;
  } | null;
  /** Estimated cost from kova.cost.* prices, null when prices are unset. */
  readonly estimatedCost: number | null;
  readonly messages: readonly {
    readonly id: string;
    readonly role: 'user' | 'assistant';
    readonly content: string;
    readonly partial: boolean;
  }[];
  readonly contextAttachments: readonly ContextAttachmentView[];
  readonly pendingApproval: ApprovalView | null;
  /** Files changed by the latest completed run, revertible via RevertRun. */
  readonly revertibleRun: {
    readonly runId: string;
    readonly files: readonly { readonly path: string; readonly created: boolean }[];
    /** A `git stash create` checkpoint exists for the run and can restore it. */
    readonly checkpointed: boolean;
  } | null;
  readonly thinkingEnabled: boolean;
  readonly contextMaxTokens: number;
}
