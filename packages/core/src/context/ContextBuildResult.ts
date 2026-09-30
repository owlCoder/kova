import type { Conversation } from '../conversations/Conversation.js';
import type { ChatMessage } from '../providers/ChatMessage.js';
import type { ContextUsage } from './ContextUsage.js';

export type ContextBuildResult =
  | {
      readonly status: 'Ready';
      readonly messages: readonly ChatMessage[];
      readonly usage: ContextUsage;
      /** Persist compacted history, not just a smaller transient provider request. */
      readonly boundedConversation: Conversation;
    }
  | {
      readonly status: 'Overflow';
      readonly code: 'PinnedContextExceedsBudget';
      readonly requiredTokens: number;
      readonly availableTokens: number;
      readonly suggestion: string;
    };
