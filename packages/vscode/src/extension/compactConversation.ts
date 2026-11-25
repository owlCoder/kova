import type { ConversationRepository } from '../../../core/src/conversations/ConversationRepository.js';
import { ConversationCompactor } from '../../../core/src/conversations/ConversationCompactor.js';
import { TokenCounter } from '../../../core/src/context/TokenCounter.js';

/** Recent entries stay visible; everything older folds into the summary. */
const KEEP_RECENT = 4;

/**
 * Folds the older conversation entries into a bounded summary while keeping
 * the most recent ones. The compactor never calls an LLM; it only extracts
 * goal, inspected files, changes and outstanding requests from the entries.
 */
export async function compactConversation(
  repository: ConversationRepository,
  conversationId: string,
): Promise<boolean> {
  const conversation = await repository.get(conversationId);
  if (!conversation) return false;
  const head = conversation.entries.slice(
    0,
    Math.max(0, conversation.entries.length - KEEP_RECENT),
  );
  if (!head.length) return false;
  const summary = new ConversationCompactor(new TokenCounter()).compact(
    head,
    conversation.summary,
    768,
  );
  await repository.save({
    ...conversation,
    entries: conversation.entries.slice(-KEEP_RECENT),
    summary,
  });
  return true;
}
