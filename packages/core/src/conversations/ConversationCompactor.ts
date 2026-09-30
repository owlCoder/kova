import type { ConversationEntry } from './Conversation.js';
import type { ConversationSummary } from './ConversationSummary.js';

/** Compact only complete turns; the implementation must not call an LLM. */
export interface ConversationCompactor {
  compact(
    entries: readonly ConversationEntry[],
    previous: ConversationSummary | null,
    maxTokens: number,
  ): ConversationSummary;
}
