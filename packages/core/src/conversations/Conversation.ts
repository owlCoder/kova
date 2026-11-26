import type { ChatMessage } from '../providers/ChatMessage.js';
import type { ConversationSummary } from './ConversationSummary.js';

export interface ConversationEntry {
  readonly id: string;
  readonly turnId: string;
  readonly stepId: string | null;
  readonly message: ChatMessage;
  readonly toolResultOrigin: 'BuiltIn' | 'Mcp' | null;
  readonly omitted: boolean;
}

export interface Conversation {
  readonly id: string;
  readonly workspaceId: string;
  readonly entries: readonly ConversationEntry[];
  readonly summary: ConversationSummary | null;
  /** Cumulative provider-reported token usage across all runs of this conversation. */
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly runs: number;
  };
}
